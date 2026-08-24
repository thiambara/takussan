<?php

namespace App\Http\Requests\Concerns;

use Closure;

/**
 * Le contrat public « point + rayon » — UNE seule définition pour tous les
 * endpoints qui l'acceptent (ADR-0023, TCK-346).
 *
 * ## Pourquoi un trait plutôt qu'une recopie
 *
 * `GET /api/public/properties/search` et `GET /api/public/properties/map` sont
 * deux endpoints, deux moteurs (Meilisearch et SQL Eloquent) et deux
 * `FormRequest` — mais **un seul écran**, `PropertiesDiscoveryPage`, qui bascule
 * de la liste à la carte sans changer de filtres. Un contrat qui diverge entre
 * les deux se voit comme deux comptes différents pour la même recherche : c'est
 * précisément le défaut que le rayon a introduit à sa livraison, et que ce trait
 * ferme.
 *
 * Les bornes, les noms, l'unité et les messages sont donc définis ici et nulle
 * part ailleurs. Le plafond est exposé en constante — `SearchPublicPropertyRequest::RADIUS_KM_MAX`
 * et `MapPublicPropertyRequest::RADIUS_KM_MAX` désignent la même valeur.
 */
trait FiltreParPointEtRayon
{
    /**
     * Rayon maximal accepté, en KILOMÈTRES (ADR-0023).
     *
     * Le plafond n'est pas cosmétique : le catalogue est sénégalais, sa plus
     * grande diagonale avoisine 700 km, et au-delà de 500 km un rayon centré
     * sur Dakar ne discrimine plus rien — c'est un filtre qui coûte au moteur
     * sans réduire l'ensemble. `addresses` ne porte AUCUN `CHECK` sur
     * `latitude` / `longitude` (mesuré le 2026-08-22 sur les 135 migrations) :
     * cette validation est le SEUL garde-fou.
     */
    public const RADIUS_KM_MAX = 500;

    /**
     * `lat` ET `lng` sont tous deux présents et exploitables.
     *
     * ⚠ `filled()` et non `has()` : `BaseFormRequest::prepareForValidation()`
     * remplace toute chaîne vide par `null`, si bien que `?lat=` arrive ici
     * comme une clé présente et nulle. `has()` la lirait comme un point donné.
     * `filled(0)` reste vrai — l'équateur et le méridien de Greenwich sont des
     * coordonnées valides.
     */
    protected function porteUnPointGeo(): bool
    {
        return $this->filled('lat') && $this->filled('lng');
    }

    /**
     * Règle de fermeture : ce paramètre n'a de sens qu'avec un point complet.
     */
    protected function exigeUnPointGeo(string $cleDeMessage): Closure
    {
        return function (string $attribut, mixed $valeur, Closure $echec) use ($cleDeMessage): void {
            if (! $this->porteUnPointGeo()) {
                $echec(__($cleDeMessage));
            }
        };
    }

    /**
     * Les trois règles du contrat « point + rayon », à fusionner dans `rules()`.
     *
     * `lat` et `lng` s'exigent MUTUELLEMENT : un point à moitié donné est une
     * erreur, jamais un filtre à moitié appliqué.
     *
     * ⚠ KILOMÈTRES à la frontière publique, sur les deux endpoints. `_geoRadius`
     * de Meilisearch prend des MÈTRES : la conversion vit dans
     * `PropertySearchService` et nulle part ailleurs. Le chemin SQL, lui,
     * calcule directement en kilomètres (`App\Support\DistanceHaversine`).
     *
     * @return array<string, array<int, mixed>>
     */
    protected function reglesPointEtRayon(): array
    {
        return [
            'lat' => ['nullable', 'numeric', 'between:-90,90', 'required_with:lng'],
            'lng' => ['nullable', 'numeric', 'between:-180,180', 'required_with:lat'],
            'radius_km' => [
                'nullable', 'numeric', 'gt:0', 'max:'.self::RADIUS_KM_MAX,
                $this->exigeUnPointGeo('validation.geo_radius_requires_point'),
            ],
        ];
    }
}
