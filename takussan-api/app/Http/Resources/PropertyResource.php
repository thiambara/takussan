<?php

namespace App\Http\Resources;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\UserType;
use App\Models\PropertyPriceHistory;
use App\Models\Review;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Lang;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class PropertyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $isDetail = $request->routeIs('public.properties.show') || $request->routeIs('properties.show');
        $address = $this->resource->relationLoaded('address') ? $this->resource->address : $this->resource->address;

        return [
            'id' => $this->id,
            'reference_number' => $this->reference_number,
            'title' => $this->title,
            'slug' => $this->slug,
            'price' => (float) $this->price,
            'currency' => $this->currency?->value,
            'type' => $this->type?->value,
            'type_label' => $this->translate('type', $this->type?->value),
            'contract_type' => $this->contract_type?->value,
            'contract_type_label' => $this->translate('contract_type', $this->contract_type?->value),
            'rent_period' => $this->rent_period?->value,
            'rent_period_label' => $this->translate('rent_period', $this->rent_period?->value),
            'status' => $this->status?->value,
            'status_label' => $this->translate('status', $this->status?->value),
            'visibility' => $this->visibility?->value,
            'title_type' => $this->title_type?->value,
            'title_type_label' => $this->translate('title_type', $this->title_type?->value),
            'location' => $this->buildLocation($address),
            'bedrooms' => $this->bedrooms,
            'bathrooms' => $this->bathrooms,
            'area' => $this->area,
            'floor_number' => $this->floor_number,
            'total_floors' => $this->total_floors,
            'year_built' => $this->year_built,
            'parking_spaces' => $this->parking_spaces,
            'furnished' => (bool) $this->furnished,
            'featured' => (bool) $this->featured,
            'views_count' => (int) ($this->views_count ?? 0),
            'favorites_count' => (int) ($this->favorites_count ?? 0),
            'average_rating' => $this->when($isDetail, fn () => $this->computeAverageRating()),
            'reviews_count' => $this->when($isDetail, fn () => $this->computeReviewsCount()),
            'main_photo_url' => $this->getFirstMediaUrl('photos', 'preview') ?: null,
            'description' => $this->when($isDetail, $this->description),
            'photos' => $this->when(
                $isDetail,
                fn () => $this->getMedia('photos')->values()->map(fn (Media $media, int $index) => [
                    'id' => $media->id,
                    'thumbnail' => $media->getUrl('thumbnail'),
                    'preview' => $media->getUrl('preview'),
                    'original' => $media->getUrl(),
                    'order' => $media->order_column ?? ($index + 1),
                ])->all()
            ),
            'media_extra' => $this->when($isDetail, fn () => [
                'videos' => $this->getMedia('videos')->map(fn (Media $m) => $m->getUrl())->values()->all(),
                'plans' => $this->getMedia('plans')->map(fn (Media $m) => $m->getUrl())->values()->all(),
                'virtual_tour_url' => data_get($this->metadata, 'virtual_tour_url'),
            ]),
            'tags' => $this->when($isDetail, fn () => $this->resource->tags->map(fn (Tag $tag) => [
                'id' => $tag->id,
                'name' => $tag->name,
                'slug' => $tag->slug,
                'type' => $tag->type?->value,
                'icon' => $tag->icon,
                'color' => $tag->color,
            ])->values()->all()),
            'owner' => $this->when($isDetail, fn () => $this->buildOwner()),
            'agency' => $this->when($isDetail, fn () => $this->buildAgency()),
            'documents' => $this->when($isDetail, fn () => $this->buildDocuments()),
            'price_history' => $this->when($isDetail, fn () => $this->buildPriceHistory()),
            'published_at' => $this->published_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }

    private function translate(string $group, ?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $key = "properties.{$group}.{$value}";
        $translation = Lang::get($key, [], 'fr');

        return $translation === $key ? null : $translation;
    }

    /**
     * @return array<string, mixed>
     */
    private function buildLocation(mixed $address): array
    {
        $quarter = $address?->neighborhood;
        $city = $address?->city;
        $region = $address?->region;
        $country = $address?->country;
        $parts = array_filter([$quarter, $city, $region, $country], fn ($v) => $v !== null && $v !== '');

        return [
            'full' => $parts === [] ? null : implode(', ', $parts),
            'quarter' => $quarter,
            'city' => $city,
            'region' => $region,
            'country' => $country,
            'latitude' => $address?->latitude !== null ? (float) $address->latitude : null,
            'longitude' => $address?->longitude !== null ? (float) $address->longitude : null,
        ];
    }

    private function computeAverageRating(): ?float
    {
        $avg = $this->resource->reviews()->where('is_approved', true)->avg('rating');

        return $avg !== null ? round((float) $avg, 2) : null;
    }

    private function computeReviewsCount(): int
    {
        return (int) $this->resource->reviews()->where('is_approved', true)->count();
    }

    /**
     * @return array<string, mixed>|null
     */
    private function buildOwner(): ?array
    {
        /** @var User|null $owner */
        $owner = $this->resource->owner;
        if ($owner === null) {
            return null;
        }

        return [
            'id' => $owner->id,
            'name' => trim($owner->first_name.' '.$owner->last_name) ?: $owner->username,
            'avatar_url' => $owner->getFirstMediaUrl('avatar') ?: null,
            'is_agent' => $owner->type === UserType::Agent || $owner->type === UserType::Broker,
            'member_since' => $owner->created_at?->toISOString(),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function buildAgency(): ?array
    {
        /** @var Agency|null $agency */
        $agency = $this->resource->agency;
        if ($agency === null) {
            return null;
        }

        $agencyRating = Review::query()
            ->where('reviewable_type', Agency::class)
            ->where('reviewable_id', $agency->id)
            ->where('is_approved', true)
            ->avg('rating');

        return [
            'id' => $agency->id,
            'name' => $agency->name,
            'slug' => $agency->slug,
            'logo_url' => $agency->getFirstMediaUrl('logo') ?: null,
            'verified' => (bool) $agency->is_verified,
            'rating' => $agencyRating !== null ? round((float) $agencyRating, 2) : null,
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildDocuments(): array
    {
        $documents = $this->resource->relationLoaded('documents')
            ? $this->resource->documents
            : $this->resource->documents()->get();

        return $documents
            ->filter(fn (Document $doc) => (bool) data_get($doc->metadata, 'public', false))
            ->values()
            ->map(function (Document $doc) {
                $media = $doc->getFirstMedia('file');

                return [
                    'id' => $doc->id,
                    'name' => $doc->name,
                    'type' => $doc->type?->value,
                    'size' => $media?->size,
                    'url' => $media?->getUrl(),
                    'public' => true,
                ];
            })->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildPriceHistory(): array
    {
        $history = $this->resource->relationLoaded('priceHistory')
            ? $this->resource->priceHistory
            : $this->resource->priceHistory()->get();

        return $history->map(fn (PropertyPriceHistory $entry) => [
            'id' => $entry->id,
            'old_price' => $entry->old_price !== null ? (float) $entry->old_price : null,
            'new_price' => $entry->new_price !== null ? (float) $entry->new_price : null,
            'currency' => $entry->currency?->value,
            'reason' => $entry->reason?->value,
            'changed_at' => $entry->changed_at?->toISOString(),
        ])->values()->all();
    }
}
