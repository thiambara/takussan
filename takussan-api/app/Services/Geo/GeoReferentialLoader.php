<?php

namespace App\Services\Geo;

use App\Models\Address;
use App\Models\Enums\GeoNeighborhoodOrigin;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\GeoRegion;
use App\Models\Property;
use App\Support\CaseInsensitive;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * TCK-633 (ADR-0062 §3) — charge `database/data/geo/regions/*.json` en base, autant de fois
 * qu'on veut.
 *
 * Une ligne se retrouve par son SLUG, puis par son NOM replié (le slug de PHP et celui du script
 * divergent sur une apostrophe : `Str::slug("Patte d'Oie")` rend `patte-doie`, le script
 * `patte-d-oie` — « Écarts relevés », E-18). Ce qui existe déjà :
 *   · reçoit les coordonnées et la référence OSM du jeu ;
 *   · garde son NOM s'il a été renommé en modération (`renamed_at`) ;
 *   · est APPROUVÉ s'il était une proposition (le jeu la confirme) ;
 *   · est IGNORÉ s'il est refusé ou fusionné — la décision humaine tient.
 * Rien n'est jamais supprimé : une ligne absente d'une extraction peut porter des adresses.
 *
 * TCK-787 (P17.03, ADR-0062 §4) — un NOM que le jeu change réécrit le texte des adresses qui
 * pointent vers la ligne, comme la modération : sans cela, la fiche et l'index gardaient l'ancien
 * nom. Les biens touchés se lisent par {@see self::biensRenommes()} ; `GeoReferentialSync` les
 * réindexe après les transactions.
 */
final class GeoReferentialLoader
{
    /** @var list<int> */
    private array $biensRenommes = [];

    /** @return list<int> les biens dont le dernier `charger()` a réécrit l'adresse */
    public function biensRenommes(): array
    {
        return $this->biensRenommes;
    }

    /** @return array{regions: int, villes: int, quartiers_crees: int, quartiers_mis_a_jour: int, quartiers_ignores: int} */
    public function charger(string $repertoire): array
    {
        $fichiers = glob(rtrim($repertoire, '/').'/*.json') ?: [];
        sort($fichiers);
        if ($fichiers === []) {
            throw new RuntimeException("Aucun fichier de référentiel dans {$repertoire}.");
        }

        $this->biensRenommes = [];
        $bilan = ['regions' => 0, 'villes' => 0, 'quartiers_crees' => 0, 'quartiers_mis_a_jour' => 0, 'quartiers_ignores' => 0];
        foreach ($fichiers as $fichier) {
            /** @var array{region: array<string, mixed>, cities: list<array<string, mixed>>} $donnees */
            $donnees = json_decode((string) file_get_contents($fichier), true, flags: JSON_THROW_ON_ERROR);
            DB::transaction(function () use ($donnees, &$bilan) {
                $this->chargerRegion($donnees, $bilan);
            });
        }

        return $bilan;
    }

    /**
     * @param  array{region: array<string, mixed>, cities: list<array<string, mixed>>}  $donnees
     * @param  array<string, int>  $bilan
     */
    private function chargerRegion(array $donnees, array &$bilan): void
    {
        $r = $donnees['region'];
        $region = GeoRegion::query()->updateOrCreate(
            ['code' => $r['code']],
            ['slug' => $r['slug'], 'name' => $r['name'], 'latitude' => $r['latitude'] ?? null, 'longitude' => $r['longitude'] ?? null],
        );
        $bilan['regions']++;

        foreach ($donnees['cities'] as $v) {
            $ville = $this->ville($region, $v);
            $bilan['villes']++;
            foreach ($v['neighborhoods'] as $q) {
                $this->quartier($ville, $q, $bilan);
            }
        }
    }

    /** @param  array<string, mixed>  $v */
    private function ville(GeoRegion $region, array $v): GeoCity
    {
        $ville = GeoCity::query()->where('geo_region_id', $region->getKey())->where('slug', $v['slug'])->first()
            ?? GeoCity::query()->where('geo_region_id', $region->getKey())
                ->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($v['name'])])
                ->first()
            ?? new GeoCity(['geo_region_id' => $region->getKey(), 'slug' => $v['slug']]);

        $ville->fill(['name' => $v['name'], 'latitude' => $v['latitude'] ?? null, 'longitude' => $v['longitude'] ?? null]);
        $renommee = $ville->exists && $ville->isDirty('name');
        if (! $ville->exists || $ville->isDirty()) {
            $ville->save();
        }
        if ($renommee) {
            $this->reecrireVille($ville);
        }

        return $ville;
    }

    /**
     * @param  array<string, mixed>  $q
     * @param  array<string, int>  $bilan
     */
    private function quartier(GeoCity $ville, array $q, array &$bilan): void
    {
        $existant = GeoNeighborhood::query()->where('geo_city_id', $ville->getKey())->where('slug', $q['slug'])->first()
            ?? GeoNeighborhood::query()->where('geo_city_id', $ville->getKey())
                ->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($q['name'])])
                ->orderByRaw("CASE WHEN merged_into_id IS NULL AND status <> 'rejected' THEN 0 ELSE 1 END")
                ->first();

        if ($existant === null) {
            GeoNeighborhood::query()->create([
                'geo_city_id' => $ville->getKey(),
                'slug' => $q['slug'],
                'name' => $q['name'],
                'latitude' => $q['latitude'] ?? null,
                'longitude' => $q['longitude'] ?? null,
                'osm_ref' => $q['osm'] ?? null,
                'status' => ReferentialStatus::Approved,
                'origin' => GeoNeighborhoodOrigin::Dataset,
            ]);
            $bilan['quartiers_crees']++;

            return;
        }

        if ($existant->status === ReferentialStatus::Rejected || $existant->merged_into_id !== null) {
            $bilan['quartiers_ignores']++;

            return;
        }

        $champs = [
            'latitude' => $q['latitude'] ?? $existant->latitude,
            'longitude' => $q['longitude'] ?? $existant->longitude,
            'osm_ref' => $q['osm'] ?? $existant->osm_ref,
            'status' => ReferentialStatus::Approved,
        ];
        if ($existant->renamed_at === null) {
            $champs['name'] = $q['name'];
        }
        $existant->fill($champs);
        $renomme = $existant->isDirty('name');
        if ($existant->isDirty()) {
            $existant->save();
            $bilan['quartiers_mis_a_jour']++;
        }
        if ($renomme) {
            $this->reecrireQuartier($existant);
        }
    }

    /**
     * Par `save()` : le crochet d'`Address` garde le rattachement (le nom concorde) et aligne le
     * texte, comme `GeoNeighborhoodModeration::reecrireAdresses`.
     */
    private function reecrireQuartier(GeoNeighborhood $quartier): void
    {
        Address::query()->where('geo_neighborhood_id', $quartier->getKey())->chunkById(200, function ($adresses) use ($quartier) {
            foreach ($adresses as $adresse) {
                $adresse->neighborhood = $quartier->name;
                $adresse->save();
                if ($adresse->addressable_type === Property::class) {
                    $this->biensRenommes[] = (int) $adresse->addressable_id;
                }
            }
        });
    }

    /**
     * Par une mise à jour SQL, et non par `save()` : le crochet d'`Address` prendrait une ville en
     * texte modifiée pour une saisie (règle 1 de `GeoAddressCanonicalizer`), la re-rapprocherait
     * par son nom et ferait tomber le quartier. La valeur écrite est celle de sa règle 5.
     */
    private function reecrireVille(GeoCity $ville): void
    {
        $adresses = Address::query()->where('geo_city_id', $ville->getKey())->where('city', '<>', $ville->name);
        foreach ((clone $adresses)->where('addressable_type', Property::class)->pluck('addressable_id') as $id) {
            $this->biensRenommes[] = (int) $id;
        }
        $adresses->update(['city' => $ville->name, 'updated_at' => now()]);
    }
}
