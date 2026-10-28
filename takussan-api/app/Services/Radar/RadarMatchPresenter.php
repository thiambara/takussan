<?php

namespace App\Services\Radar;

use App\Models\Property;
use App\Models\RadarListing;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Media\WatermarkRequirement;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-2387 (ADR-0077 §6) — ce que la fiche montre d'un rapprochement : la cible, de quoi la reconnaître
 * (titre, prix, chambres, quartier, état) et sa vignette. {@see RadarMatcher} ne rend que `{kind, id,
 * strength, signals}` ; le statut d'un bien et sa visibilité publique s'ajoutent ici (décision 4 du plan).
 *
 * **Les cibles se chargent en lot** : une requête pour les biens (avec leur adresse), une pour leurs
 * premières photos, une pour savoir lesquels sont publics ; une pour les annonces et une pour leurs
 * premières captures. Le nombre de requêtes ne dépend pas du nombre de cibles.
 *
 * **Aucun numéro ne sort** : ni celui de l'annonce, ni celui d'une cible, ni le nom d'un annonceur.
 *
 * Vignette d'un bien : sa première photo, en conversion publique servable (jamais l'original). Vignette
 * d'une annonce : sa première capture, par URL signée (ADR-0029) ; à défaut la première `photo_urls`,
 * que le front affiche par une balise `<img>` directe (décision 2, option 10a) ; à défaut `null`.
 */
final class RadarMatchPresenter
{
    public function __construct(private readonly PrivateMediaAccess $privateMedia) {}

    /**
     * @param  list<array{kind: string, id: int, strength: string, signals: list<array<string, mixed>>}>  $matches
     * @return list<array<string, mixed>> les rapprochements, chacun avec sa `target` ; une cible disparue entre-temps est omise
     */
    public function present(array $matches): array
    {
        $propertyIds = $this->idsOf($matches, 'property');
        $listingIds = $this->idsOf($matches, 'listing');

        $properties = $this->properties($propertyIds);
        $listings = $this->listings($listingIds);

        $out = [];
        foreach ($matches as $match) {
            $target = $match['kind'] === 'property'
                ? ($properties[$match['id']] ?? null)
                : ($listings[$match['id']] ?? null);
            if ($target !== null) {
                $out[] = $match + ['target' => $target];
            }
        }

        return $out;
    }

    /**
     * @param  list<array<string, mixed>>  $matches
     * @return list<int>
     */
    private function idsOf(array $matches, string $kind): array
    {
        return array_values(array_unique(array_map(
            fn (array $match): int => $match['id'],
            array_filter($matches, fn (array $match): bool => $match['kind'] === $kind),
        )));
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, array<string, mixed>>
     */
    private function properties(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $properties = Property::query()->whereIn('id', $ids)->with('address')->get()->keyBy('id');
        WatermarkRequirement::attach($properties);
        $public = Property::query()->public()->whereIn('properties.id', $ids)->pluck('properties.id')->flip();
        $photos = $this->firstMedia(Property::class, 'photos', $ids);

        return $properties->map(fn (Property $property): array => [
            'title' => $property->title,
            'price' => $property->price === null ? null : (int) round((float) $property->price),
            'bedrooms' => $property->bedrooms,
            'neighborhood' => $property->address?->neighborhood,
            'status' => $property->status?->value,
            'is_public' => $public->has($property->id),
            'slug' => $property->slug,
            'reference_number' => $property->reference_number,
            'thumbnail_url' => ($photo = $photos->get($property->id)) === null
                ? null
                : PublicPhotoUrl::upTo($photo, 'thumbnail', fn () => $property->requiresWatermark()),
        ])->all();
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, array<string, mixed>>
     */
    private function listings(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $captures = $this->firstMedia(RadarListing::class, 'radar_captures', $ids);

        return RadarListing::query()
            ->whereIn('id', $ids)
            ->get(['id', 'source_site', 'stage', 'photo_urls', 'extracted'])
            ->mapWithKeys(fn (RadarListing $listing): array => [$listing->id => [
                'title' => $listing->extracted['title']['value'] ?? null,
                'price' => $listing->extracted['price']['value'] ?? null,
                'stage' => $listing->stage->value,
                'source_site' => $listing->source_site?->value,
                'thumbnail_url' => ($capture = $captures->get($listing->id)) !== null
                    ? $this->privateMedia->signedUrl($capture)
                    : (($listing->photo_urls ?? [])[0] ?? null),
            ]])
            ->all();
    }

    /**
     * La première pièce de chaque modèle (`order_column`, puis `id`), en UNE requête : `DISTINCT ON` choisit
     * la ligne, sans charger les trente photos d'un bien pour n'en garder qu'une.
     *
     * @param  class-string  $model
     * @param  list<int>  $ids
     * @return Collection<int, Media> indexée par l'identifiant du modèle
     */
    private function firstMedia(string $model, string $collection, array $ids): Collection
    {
        $first = DB::table('media')
            ->selectRaw('DISTINCT ON (model_id) id')
            ->where('model_type', (new $model)->getMorphClass())
            ->whereIn('model_id', $ids)
            ->where('collection_name', $collection)
            ->orderBy('model_id')->orderBy('order_column')->orderBy('id');

        return Media::query()->whereIn('id', $first)->get()->keyBy('model_id');
    }
}
