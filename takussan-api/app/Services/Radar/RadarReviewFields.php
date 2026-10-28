<?php

namespace App\Services\Radar;

use InvalidArgumentException;

/**
 * TCK-2387 (ADR-0077 §5) — les champs relus : ce que l'opérateur voit et corrige sur une fiche extraite,
 * et donc ce que décide la suggestion `radar.extraction`.
 */
final class RadarReviewFields
{
    /**
     * Ce que l'opérateur relit. Les clés suivent `resources/ai/evals/radar.extraction/fields.json` pour que
     * `ai:export-eval-cases` (TCK-2403) en tire des cas. Ni téléphones ni nom : ils vont à l'annonceur
     * (données personnelles, ADR-0077 §9) — ils ne sont pas dans une proposition qui sert à mesurer le
     * modèle. `price` est le MONTANT en XOF que l'humain décide, pas le texte recopié.
     */
    public const FIELDS = [
        'property_type', 'contract', 'rent_period', 'price', 'neighborhood', 'neighborhood_id', 'city',
        'bedrooms', 'bathrooms', 'surface_m2', 'furnished', 'amenities', 'title', 'description',
        'advertiser_nature',
    ];

    /** `neighborhood` est le texte lu : on rattache un quartier (`neighborhood_id`), on ne réécrit pas la lecture. */
    public const EDITABLE = [
        'property_type', 'contract', 'rent_period', 'price', 'neighborhood_id', 'city',
        'bedrooms', 'bathrooms', 'surface_m2', 'furnished', 'amenities', 'title', 'description',
        'advertiser_nature',
    ];

    /** Contrainte du ticket : une annonce `reviewed` a un type, un contrat, un prix et un quartier du référentiel. */
    public const REQUIRED_FOR_REVIEW = ['property_type', 'contract', 'price', 'neighborhood_id'];

    /**
     * Les valeurs à plat d'un `extracted` (normalisé, éventuellement corrigé).
     *
     * @param  array<string, mixed>  $extracted
     * @return array<string, mixed>
     */
    public static function values(array $extracted): array
    {
        $out = [];
        foreach (self::FIELDS as $field) {
            $out[$field] = $field === 'neighborhood_id'
                ? ($extracted['neighborhood']['neighborhood_id'] ?? null)
                : ($extracted[$field]['value'] ?? null);
        }

        return $out;
    }

    /**
     * Les corrections écrites dans `extracted` : la valeur remplacée, `corrected: true`, drapeaux levés ;
     * confiance et passage cité restent ceux de la lecture (la fiche les montre « lus par l'IA »).
     * Un quartier rattaché (`neighborhood_id`) marque le champ `neighborhood`, dont le texte lu ne change pas.
     *
     * @param  array<string, mixed>  $extracted
     * @param  array<string, mixed>  $changes  clés de {@see self::EDITABLE}
     * @return array<string, mixed>
     *
     * @throws InvalidArgumentException une clé qui n'est pas éditable
     */
    public static function apply(array $extracted, array $changes): array
    {
        $unknown = array_diff(array_keys($changes), self::EDITABLE);
        if ($unknown !== []) {
            throw new InvalidArgumentException('Champ non éditable : '.implode(', ', $unknown));
        }

        foreach ($changes as $field => $value) {
            $key = $field === 'neighborhood_id' ? 'neighborhood' : $field;
            $entry = is_array($extracted[$key] ?? null) ? $extracted[$key] : ['value' => null, 'confidence' => 'low', 'evidence' => null];
            $entry[$field === 'neighborhood_id' ? 'neighborhood_id' : 'value'] = $value;
            $entry['corrected'] = true;
            $entry['flags'] = [];
            $extracted[$key] = $entry;
        }

        return $extracted;
    }
}
