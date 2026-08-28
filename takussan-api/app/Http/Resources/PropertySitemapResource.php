<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/**
 * L'énumération d'un bien pour le sitemap du site public (TCK-431).
 *
 * **Deux clés, et c'est le point.** Un sitemap a besoin d'une URL et d'une date de dernière
 * modification, rien d'autre. `PropertyResource` en émet 47, charge `address` et `media`, et
 * n'accepte aucun `fields[properties]` — `PublicPropertyController::index()` n'est pas bâti sur
 * spatie. L'employer pour énumérer le catalogue reviendrait à télécharger les fiches entières,
 * médias compris, pour en extraire deux colonnes.
 *
 * `updated_at` passe par `iso()` (ADR-0018) : c'est ce que le `<lastmod>` du protocole attend, et
 * une chaîne SQL brute y serait lue comme une heure LOCALE par le front.
 */
class PropertySitemapResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'slug' => $this->resource->slug,
            'updated_at' => $this->iso($this->resource->updated_at),
        ];
    }
}
