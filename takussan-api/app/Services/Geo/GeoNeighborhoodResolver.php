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
 * La comparaison replie la casse (`CaseInsensitive`, ADR-0025), les espaces, et — TCK-788 (P17.02) —
 * les tirets et les apostrophes, comme `replierPourIdentite` côté front : « Grand-Yoff » est
 * « Grand Yoff ». Les accents restent distincts (ADR-0062 § 1). Le nom exact l'emporte sur un nom
 * seulement replié, pour qu'un doublon déjà en base ne change pas de cible. L'expression repliée
 * n'emprunte pas l'index du nom : la recherche est bornée aux quartiers d'une ville.
 */
final class GeoNeighborhoodResolver
{
    /** Les séparateurs repliés en une espace : blancs, tirets (ASCII et typographiques), apostrophes. */
    public const SEPARATEURS = "[\\s'’ʼ‐‑‒–—-]+";

    /** La clé de comparaison côté PHP — le pendant de l'expression SQL de {@see self::trouver()}. */
    public static function cle(string $texte): string
    {
        return trim((string) preg_replace('/'.self::SEPARATEURS.'/u', ' ', CaseInsensitive::fold($texte)));
    }

    /** La même clé, accents retirés : ce qui rapproche « Medina » de « Médina » en modération. */
    public static function cleSansAccents(string $texte): string
    {
        $decompose = \Normalizer::normalize(self::cle($texte), \Normalizer::FORM_D);

        return (string) preg_replace('/\p{Mn}+/u', '', $decompose === false ? self::cle($texte) : $decompose);
    }

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

        $exact = CaseInsensitive::sql('name');

        return GeoNeighborhood::query()
            ->where('geo_city_id', $ville->getKey())
            ->whereRaw("btrim(regexp_replace({$exact}, ?, ' ', 'g')) = ?", [self::SEPARATEURS, self::cle($nom)])
            ->orderByRaw("CASE WHEN merged_into_id IS NULL AND status <> 'rejected' THEN 0 WHEN merged_into_id IS NOT NULL THEN 1 ELSE 2 END")
            ->orderByRaw("CASE WHEN {$exact} = ? THEN 0 ELSE 1 END", [CaseInsensitive::fold($nom)])
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
