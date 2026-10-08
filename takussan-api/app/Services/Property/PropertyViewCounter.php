<?php

namespace App\Services\Property;

use App\Models\Property;
use Illuminate\Support\Facades\RateLimiter;

/**
 * TCK-598 (contrainte 3, ADR-0052 §1) — le SEUL chemin qui compte une vue de bien.
 *
 * Deux routes comptaient, chacune à sa manière : `GET /public/properties/{slug}` (clé
 * `views:{id}:{ip}`) et `POST /properties/{property}/view` (clé `property-view:{id}:{ip}`). Un même
 * visiteur passé par les deux comptait deux fois, et les deux écrivaient par
 * `$property->increment()` — qui n'est PAS une écriture neutre :
 *
 *   · il déclenche `updating`/`updated`, donc `PropertyObserver::updated`, qui vide l'étiquette
 *     ENTIÈRE `property-similar` : la vue d'un bien effaçait les biens similaires de tous ;
 *   · il rajeunit `updated_at`, que le sitemap publie en `lastModified` : un bien seulement VU
 *     était annoncé modifié.
 *
 * ⚠ **`Property::query()->whereKey()->increment()` ne suffit pas non plus**, et le ticket le
 * prescrivait : le constructeur ÉLOQUENT ajoute `updated_at` à tout `increment()`
 * (`Eloquent\Builder::increment()` → `addUpdatedAtColumn()`, relu dans `vendor/`). Seul le
 * constructeur de BASE (`toBase()`) écrit la colonne et rien d'autre.
 *
 * Déduplication : 3 vues par (bien, IP) et par heure, comme avant, sous UNE clé commune aux deux
 * routes.
 */
class PropertyViewCounter
{
    public const MAX_PAR_HEURE = 3;

    public const FENETRE_SECONDES = 3600;

    public function record(Property $property, string $ip): void
    {
        $cle = self::cle($property, $ip);

        if (RateLimiter::tooManyAttempts($cle, self::MAX_PAR_HEURE)) {
            return;
        }

        RateLimiter::hit($cle, self::FENETRE_SECONDES);

        Property::query()->whereKey($property->getKey())->toBase()->increment('views_count');
    }

    public static function cle(Property $property, string $ip): string
    {
        return 'property-view:'.$property->getKey().':'.$ip;
    }
}
