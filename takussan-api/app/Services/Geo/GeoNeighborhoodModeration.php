<?php

namespace App\Services\Geo;

use App\Models\Address;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\User;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 (AC5) — les quatre décisions de la file des quartiers.
 *
 * Chaque décision verrouille la ligne (`lockForUpdate`) : deux super-admins qui tranchent la même
 * proposition ne doivent pas l'approuver et la refuser à la fois. Une fusion verrouille les deux
 * lignes dans l'ordre des identifiants, pour ne jamais s'interbloquer avec la fusion inverse.
 *
 * Les adresses se réécrivent par `save()` : c'est le crochet d'`Address` qui aligne leur texte.
 * La réindexation suit la transaction — jamais dedans, où un rollback laisserait l'index en avance.
 */
final class GeoNeighborhoodModeration
{
    public function __construct(private readonly GeoReindexation $reindexation) {}

    public function approuver(GeoNeighborhood $quartier, User $par): GeoNeighborhood
    {
        DB::transaction(function () use ($quartier) {
            $ligne = $this->verrouiller($quartier);
            $this->exigerEnAttente($ligne);
            $ligne->forceFill(['status' => ReferentialStatus::Approved])->save();
        });
        $this->journaliser($quartier, $par, 'super_admin_geo_neighborhood_approved', [], 'Quartier approuvé');

        return $quartier->refresh();
    }

    public function rejeter(GeoNeighborhood $quartier, User $par): GeoNeighborhood
    {
        DB::transaction(function () use ($quartier) {
            $ligne = $this->verrouiller($quartier);
            $this->exigerEnAttente($ligne);
            $ligne->forceFill(['status' => ReferentialStatus::Rejected])->save();
            // Le texte reste : c'est ce que la personne a écrit, et la fiche continue de l'afficher.
            $this->reecrireAdresses($ligne, null);
        });
        $this->journaliser($quartier, $par, 'super_admin_geo_neighborhood_rejected', [], 'Quartier refusé');

        return $quartier->refresh();
    }

    public function renommer(GeoNeighborhood $quartier, string $nom, User $par): GeoNeighborhood
    {
        $nom = trim((string) preg_replace('/\s+/u', ' ', $nom));
        $ancien = $quartier->name;

        $biens = DB::transaction(function () use ($quartier, $nom) {
            $ligne = $this->verrouiller($quartier);
            $pris = GeoNeighborhood::query()
                ->where('geo_city_id', $ligne->geo_city_id)
                ->whereKeyNot($ligne->getKey())
                ->whereNull('merged_into_id')
                ->where('status', '<>', ReferentialStatus::Rejected->value)
                ->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($nom)])
                ->exists();
            abort_code_if($pris, 409, 'geo.name_taken');
            $ligne->forceFill(['name' => $nom, 'renamed_at' => now()])->save();

            return $this->reecrireAdresses($ligne, $ligne);
        });
        $this->reindexation->biens($biens);
        $this->journaliser($quartier, $par, 'super_admin_geo_neighborhood_renamed', ['from' => $ancien, 'to' => $nom], 'Quartier renommé');

        return $quartier->refresh();
    }

    public function fusionner(GeoNeighborhood $source, GeoNeighborhood $cible, User $par): GeoNeighborhood
    {
        abort_code_if($source->is($cible), 422, 'geo.merge_into_self');
        abort_code_if((int) $source->geo_city_id !== (int) $cible->geo_city_id, 422, 'geo.merge_other_city');

        $biens = DB::transaction(function () use ($source, $cible) {
            foreach ($source->getKey() < $cible->getKey() ? [$source, $cible] : [$cible, $source] as $ligne) {
                $this->verrouiller($ligne);
            }
            $src = GeoNeighborhood::query()->findOrFail($source->getKey());
            $cbl = GeoNeighborhood::query()->findOrFail($cible->getKey());
            abort_code_if(
                $cbl->status === ReferentialStatus::Rejected || $cbl->merged_into_id !== null || $src->merged_into_id !== null,
                422,
                'geo.merge_target_inactive',
            );

            // Ce qui avait été fusionné DANS la source suit la cible : aucune chaîne ne s'allonge.
            GeoNeighborhood::query()->where('merged_into_id', $src->getKey())->update(['merged_into_id' => $cbl->getKey(), 'updated_at' => now()]);
            $src->forceFill(['merged_into_id' => $cbl->getKey()])->save();

            return $this->reecrireAdresses($src, $cbl);
        });
        $this->reindexation->biens($biens);
        $this->journaliser($source, $par, 'super_admin_geo_neighborhood_merged', ['into_id' => $cible->getKey()], 'Quartier fusionné');

        return $cible->refresh();
    }

    private function verrouiller(GeoNeighborhood $quartier): GeoNeighborhood
    {
        return GeoNeighborhood::query()->whereKey($quartier->getKey())->lockForUpdate()->firstOrFail();
    }

    private function exigerEnAttente(GeoNeighborhood $ligne): void
    {
        abort_code_if(
            $ligne->status !== ReferentialStatus::Pending || $ligne->merged_into_id !== null,
            409,
            'geo.neighborhood_not_pending',
        );
    }

    /** @return list<int> les biens dont l'adresse a changé */
    private function reecrireAdresses(GeoNeighborhood $source, ?GeoNeighborhood $cible): array
    {
        $biens = [];
        Address::query()->where('geo_neighborhood_id', $source->getKey())->chunkById(200, function (Collection $adresses) use ($cible, &$biens) {
            foreach ($adresses as $adresse) {
                $adresse->geo_neighborhood_id = $cible?->getKey();
                if ($cible !== null) {
                    $adresse->geo_city_id = $cible->geo_city_id;
                    $adresse->neighborhood = $cible->name;
                }
                $adresse->save();
                if ($adresse->addressable_type === Property::class) {
                    $biens[] = (int) $adresse->addressable_id;
                }
            }
        });

        return $biens;
    }

    /** @param  array<string, mixed>  $details */
    private function journaliser(GeoNeighborhood $quartier, User $par, string $evenement, array $details, string $libelle): void
    {
        activity('Admin')
            ->performedOn($quartier)
            ->causedBy($par)
            ->withProperties(['geo_neighborhood_id' => $quartier->getKey(), 'name' => $quartier->name] + $details)
            ->event($evenement)
            ->log($libelle);
    }
}
