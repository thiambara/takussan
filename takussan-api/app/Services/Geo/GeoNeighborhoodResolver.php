<?php

namespace App\Services\Geo;

use App\Models\Enums\GeoNeighborhoodOrigin;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Support\CaseInsensitive;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 (ADR-0062 §4) — un nom de quartier saisi, rapporté au référentiel de sa ville.
 *
 * L'ordre de recherche n'est pas indifférent : un quartier ACTIF d'abord, puis un FUSIONNÉ (qui
 * renvoie à sa cible), puis un REFUSÉ (qui renvoie `null`). Sans ce dernier, un nom refusé
 * retapé le lendemain recréerait la proposition que la modération vient d'écarter.
 *
 * La comparaison écrit EXACTEMENT l'expression de l'index (`CaseInsensitive::sql`), sinon elle ne
 * l'emprunte pas (CLAUDE.md, piège n°9).
 */
final class GeoNeighborhoodResolver
{
    public function nettoyer(string $texte): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', $texte));
    }

    public function trouver(GeoCity $ville, string $texte): ?GeoNeighborhood
    {
        $nom = $this->nettoyer($texte);
        if ($nom === '') {
            return null;
        }

        return GeoNeighborhood::query()
            ->where('geo_city_id', $ville->getKey())
            ->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($nom)])
            ->orderByRaw("CASE WHEN merged_into_id IS NULL AND status <> 'rejected' THEN 0 WHEN merged_into_id IS NOT NULL THEN 1 ELSE 2 END")
            ->orderBy('id')
            ->first();
    }

    /**
     * Le quartier qui fait foi pour ce texte, créé en proposition s'il n'existe pas et qu'un auteur
     * est connu. `null` : texte vide, nom refusé, ou aucun auteur (un chargement en console ne
     * propose rien).
     */
    public function resoudreOuProposer(GeoCity $ville, string $texte, ?int $auteurId): ?GeoNeighborhood
    {
        $nom = $this->nettoyer($texte);
        if ($nom === '') {
            return null;
        }

        return DB::transaction(function () use ($ville, $nom, $auteurId): ?GeoNeighborhood {
            // CLAUDE.md, piège n°2 : deux propositions simultanées du même nom se sérialisent sur
            // la ligne PARENT ; verrouiller les quartiers existants ne fermerait aucune course.
            GeoCity::query()->whereKey($ville->getKey())->lockForUpdate()->first();

            $existant = $this->trouver($ville, $nom);
            if ($existant !== null) {
                return $existant->canonique();
            }

            if ($auteurId === null || mb_strlen($nom) > GeoNeighborhood::NOM_MAX) {
                return null;
            }

            return GeoNeighborhood::query()->create([
                'geo_city_id' => $ville->getKey(),
                'slug' => GeoNeighborhood::slugLibre((int) $ville->getKey(), $nom),
                'name' => $nom,
                'status' => ReferentialStatus::Pending,
                'origin' => GeoNeighborhoodOrigin::User,
                'created_by_id' => $auteurId,
            ]);
        });
    }
}
