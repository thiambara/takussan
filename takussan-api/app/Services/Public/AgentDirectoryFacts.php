<?php

namespace App\Services\Public;

use App\Models\GeoNeighborhood;
use App\Models\Profiles\AgentProfile;

/**
 * TCK-2518 — ce que l'annuaire public dit d'un agent au-delà de son portefeuille : ses langues, ses
 * quartiers et son délai de réponse habituel. Une seule forme pour l'index et la fiche.
 *
 * Les langues sortent en CODES (le libellé est celui du front, principe n° 5) ; les quartiers en
 * identifiants ET en noms du référentiel — un nom de quartier est une donnée, pas un texte
 * d'interface, et le front n'a pas à relire le référentiel pour cinq noms. Un code hors de la liste
 * de `directory.languages`, ou un quartier retiré du référentiel, est sauté, jamais émis.
 */
final class AgentDirectoryFacts
{
    /**
     * Les noms des quartiers que ces profils désignent, par identifiant (une requête).
     *
     * @param  iterable<AgentProfile>  $profils
     * @return array<int, string>
     */
    public static function quartiers(iterable $profils): array
    {
        $ids = [];
        foreach ($profils as $profil) {
            foreach ((array) ($profil->neighborhood_ids ?? []) as $id) {
                if (is_numeric($id)) {
                    $ids[(int) $id] = true;
                }
            }
        }

        return $ids === []
            ? []
            : GeoNeighborhood::query()->whereIn('id', array_keys($ids))->pluck('name', 'id')->map(fn ($nom) => (string) $nom)->all();
    }

    /**
     * @param  array<int, string>  $quartiers  {@see self::quartiers()}
     * @return array{languages: list<string>, neighborhood_ids: list<int>, neighborhoods: list<array{id: int, name: string}>, median_response_minutes: int|null}
     */
    public static function pour(?AgentProfile $profil, array $quartiers): array
    {
        $connues = (array) config('directory.languages', []);
        $langues = array_values(array_filter(
            (array) ($profil?->languages ?? []),
            fn ($code) => is_string($code) && in_array($code, $connues, true),
        ));

        $voisins = [];
        foreach ((array) ($profil?->neighborhood_ids ?? []) as $id) {
            if (is_numeric($id) && isset($quartiers[(int) $id])) {
                $voisins[] = ['id' => (int) $id, 'name' => $quartiers[(int) $id]];
            }
        }

        return [
            'languages' => $langues,
            'neighborhood_ids' => array_column($voisins, 'id'),
            'neighborhoods' => $voisins,
            'median_response_minutes' => $profil?->median_response_minutes,
        ];
    }
}
