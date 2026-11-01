<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Models\GeoNeighborhood;
use App\Models\RadarListing;
use App\Models\RadarListingSnapshot;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Radar\RadarPhotoReserve;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-2386 (ADR-0077) — une annonce du Radar pour la console. Chaque colonne passe par `whenHas` :
 * sous un sparse fieldset (`fields[radar_listings]=…`), une colonne non lue est omise plutôt
 * qu'inventée nulle. `stage_reason` est un code (`radar.*`, `ai.*`), jamais une phrase.
 *
 * Les captures (fiche seule, `captures`) rendent leurs métadonnées et une URL signée
 * (`PrivateMediaAccess::signedUrl()`, ADR-0029) : la signature EST l'autorisation, émise ici parce que la
 * ressource n'est rendue que derrière `platform.radar.operate`. Le fichier lui-même est servi par la route
 * signée existante `media.private.show` (redirection) ; aucune route n'est propre au Radar. L'URL expire
 * (5 minutes) : le front la redemande en rouvrant la fiche.
 */
class RadarListingResource extends BaseResource
{
    /** `false` : non demandé (la liste) ; `null` : demandé, aucun quartier rattaché. */
    private array|false|null $neighborhoodLink = false;

    /**
     * TCK-2387 — le quartier rattaché (`{id, name, city}`), lu une fois, pour la fiche seule (`show`, `update`,
     * `review`) : la liste n'en a pas besoin et ne paie aucune requête de plus. Posé avant la sérialisation.
     */
    public function withNeighborhoodLink(): static
    {
        $id = $this->resource->extracted['neighborhood']['neighborhood_id'] ?? null;
        $neighborhood = is_int($id) ? GeoNeighborhood::query()->with('city:id,name')->find($id) : null;

        $this->neighborhoodLink = $neighborhood === null ? null : [
            'id' => $neighborhood->id,
            'name' => $neighborhood->name,
            'city' => $neighborhood->city?->name,
        ];

        return $this;
    }

    /** `false` : non demandé (la liste). */
    private array|false $provenances = false;

    /**
     * TCK-2392 (AC3) — les provenances de la fiche : l'annonce qui fait foi (elle-même, ou celle dont elle est le doublon) et
     * chacun de ses doublons, avec le site, l'URL, la fusion automatique (`merged_at`) et la présence relevée par la collecte
     * (premier et dernier passage qui l'ont vue, dernier prix observé). Fiche seule, comme le quartier : deux requêtes.
     */
    public function withProvenances(): static
    {
        $rootId = $this->resource->duplicate_of_listing_id ?? $this->resource->id;
        $listings = RadarListing::query()
            ->where(fn ($q) => $q->whereKey($rootId)->orWhere('duplicate_of_listing_id', $rootId))
            ->orderBy('id')
            ->get(['id', 'source_kind', 'source_site', 'source_url', 'stage', 'stage_reason', 'merged_at', 'discovered_by_run_id', 'created_at']);

        $presence = RadarListingSnapshot::query()
            ->whereIn('radar_listing_id', $listings->modelKeys())
            ->selectRaw('radar_listing_id, min(first_seen_at) as first_seen_at, max(last_seen_at) as last_seen_at')
            ->groupBy('radar_listing_id')
            ->get()
            ->keyBy('radar_listing_id');
        $lastPrice = RadarListingSnapshot::query()
            ->whereIn('radar_listing_id', $listings->modelKeys())
            ->orderBy('radar_listing_id')->orderByDesc('first_seen_at')->orderByDesc('id')
            ->get(['radar_listing_id', 'price'])
            ->unique('radar_listing_id')
            ->keyBy('radar_listing_id');

        $this->provenances = $listings->map(fn (RadarListing $listing): array => [
            'listing_id' => $listing->id,
            'is_root' => $listing->id === $rootId,
            'source_kind' => $this->enumValue($listing->source_kind),
            'source_site' => $this->enumValue($listing->source_site),
            'source_url' => $listing->source_url,
            'stage' => $this->enumValue($listing->stage),
            'merged_at' => $this->iso($listing->merged_at),
            'crawled' => $listing->discovered_by_run_id !== null,
            'first_seen_at' => $this->iso(self::date($presence->get($listing->id)?->first_seen_at)),
            'last_seen_at' => $this->iso(self::date($presence->get($listing->id)?->last_seen_at)),
            'last_price' => ($price = $lastPrice->get($listing->id)?->price) === null ? null : (float) $price,
        ])->all();

        return $this;
    }

    private static function date(mixed $value): ?\DateTimeInterface
    {
        return $value === null ? null : ($value instanceof \DateTimeInterface ? $value : Carbon::parse($value));
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->whenHas('id'),
            'radar_advertiser_id' => $this->whenHas('radar_advertiser_id'),
            'source_kind' => $this->whenHas('source_kind', fn () => $this->enumValue($this->source_kind)),
            'source_site' => $this->whenHas('source_site', fn () => $this->enumValue($this->source_site)),
            'source_url' => $this->whenHas('source_url'),
            'raw_text' => $this->whenHas('raw_text'),
            'photo_urls' => $this->whenHas('photo_urls', fn () => $this->photo_urls ?? []),
            'content_fingerprint' => $this->whenHas('content_fingerprint'),
            'extracted' => $this->whenHas('extracted'),
            'matches' => $this->whenHas('matches', fn () => $this->matches ?? []),
            'stage' => $this->whenHas('stage', fn () => $this->enumValue($this->stage)),
            'stage_reason' => $this->whenHas('stage_reason'),
            'extraction_attempts' => $this->whenHas('extraction_attempts'),
            'extracted_at' => $this->whenHas('extracted_at', fn () => $this->iso($this->extracted_at)),
            'property_id' => $this->whenHas('property_id'),
            'duplicate_of_listing_id' => $this->whenHas('duplicate_of_listing_id'),
            'duplicate_of_property_id' => $this->whenHas('duplicate_of_property_id'),
            // Les empreintes elles-mêmes ne sortent jamais : seul l'avancement du calcul.
            'photo_fingerprints' => $this->when(
                $this->hasColumns('source_photo_hashes', 'photo_urls', 'source_kind'),
                fn () => $this->photoFingerprintStatus(),
            ),
            // TCK-2389 — l'avancement de la réserve de photos de la publication (jamais les éléments eux-mêmes).
            'photo_preparation' => $this->when(
                $this->hasColumns('photo_preparation', 'photo_urls', 'source_kind', 'stage'),
                fn () => $this->photoPreparationStatus(),
            ),
            'captured_by' => $this->whenHas('captured_by'),
            'purge_at' => $this->whenHas('purge_at', fn () => $this->iso($this->purge_at)),
            'created_at' => $this->whenHas('created_at', fn () => $this->iso($this->created_at)),
            'updated_at' => $this->whenHas('updated_at', fn () => $this->iso($this->updated_at)),
            'neighborhood_link' => $this->when($this->neighborhoodLink !== false, fn () => $this->neighborhoodLink),
            'provenances' => $this->when($this->provenances !== false, fn () => $this->provenances),
            'merged_at' => $this->whenHas('merged_at', fn () => $this->iso($this->merged_at)),
            'discovered_by_run_id' => $this->whenHas('discovered_by_run_id'),
            'advertiser' => $this->whenLoaded('advertiser', fn () => $this->advertiser === null ? null : [
                'id' => $this->advertiser->id,
                'phone' => $this->advertiser->phone,
                'display_name' => $this->advertiser->display_name,
                'nature' => $this->enumValue($this->advertiser->nature),
                'do_not_contact_at' => $this->iso($this->advertiser->do_not_contact_at),
            ]),
            // La relation `media` n'a pas d'`ORDER BY` : l'ordre d'un `SELECT` libre n'est pas celui des captures.
            'captures' => $this->whenLoaded('media', fn () => $this->media
                ->where('collection_name', 'radar_captures')
                ->sortBy('order_column')
                ->values()
                ->map(fn (Media $media): array => [
                    'id' => $media->id,
                    'mime_type' => $media->mime_type,
                    'size' => $media->size,
                    'sha256' => $media->getCustomProperty('sha256'),
                    'url' => app(PrivateMediaAccess::class)->signedUrl($media),
                ])->all()),
            // TCK-2389 — la réserve de photos : une URL signée par photo, comme les captures.
            // Dans l'ordre que la publication copie et que l'aperçu affiche : la relation `media` n'a pas d'`ORDER BY`.
            'reserve_photos' => $this->whenLoaded('media', fn () => app(RadarPhotoReserve::class)->ordered($this->resource)
                ->map(fn (Media $media): array => [
                    'id' => $media->id,
                    'url' => app(PrivateMediaAccess::class)->signedUrl($media),
                ])->all()),
        ];
    }

    /** Sous un sparse fieldset, l'état des empreintes ne se calcule que si les trois colonnes qu'il lit sont là. */
    private function hasColumns(string ...$columns): bool
    {
        foreach ($columns as $column) {
            // `hasAttribute()` répond aussi pour une colonne castée mais non lue : on regarde ce qui est chargé.
            if (! array_key_exists($column, $this->resource->getAttributes())) {
                return false;
            }
        }

        return true;
    }
}
