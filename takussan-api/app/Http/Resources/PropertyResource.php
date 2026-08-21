<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Agency;
use App\Models\Document;
use App\Models\Profiles\BrokerProfile;
use App\Models\PropertyPriceHistory;
use App\Models\Review;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class PropertyResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $isDetail = $request->routeIs('public.properties.show')
            || $request->routeIs('properties.show')
            || $request->routeIs('public.properties.compare');
        $address = $this->resource->relationLoaded('address') ? $this->resource->address : null;

        return [
            'id' => $this->id,
            'reference_number' => $this->reference_number,
            'title' => $this->title,
            'slug' => $this->slug,
            'price' => (float) $this->price,
            'currency' => $this->currency?->value,
            'type' => $this->type?->value,
            'type_label' => $this->enumLabel($this->type, 'properties.type'),
            'contract_type' => $this->contract_type?->value,
            'contract_type_label' => $this->enumLabel($this->contract_type, 'properties.contract_type'),
            'rent_period' => $this->rent_period?->value,
            'rent_period_label' => $this->enumLabel($this->rent_period, 'properties.rent_period'),
            'status' => $this->status?->value,
            'status_label' => $this->enumLabel($this->status, 'properties.status'),
            'visibility' => $this->visibility?->value,
            'title_type' => $this->title_type?->value,
            'title_type_label' => $this->enumLabel($this->title_type, 'properties.title_type'),
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
            'main_photo_url' => ($m = $this->getFirstMedia('photos')) ? $this->urlFor($m, 'preview') : null,
            'description' => $this->when($isDetail, $this->description),
            'photos' => $this->when(
                $isDetail,
                fn () => $this->getMedia('photos')->values()->map(fn (Media $media, int $index) => [
                    'id' => $media->id,
                    'thumbnail' => $this->urlFor($media, 'thumbnail'),
                    'preview' => $this->urlFor($media, 'preview'),
                    'original' => $this->originalUrlFor($media),
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
            'owner' => $this->when(
                $isDetail || $this->resource->relationLoaded('owner'),
                fn () => $this->buildOwner()
            ),
            'collaborators' => $this->when(
                $this->resource->relationLoaded('collaborators'),
                fn () => $this->resource->collaborators->map(fn ($collaborator) => [
                    'id' => $collaborator->id,
                    'user_id' => $collaborator->user_id,
                    'role' => $collaborator->role?->value,
                    'commission_share' => $collaborator->commission_share !== null
                        ? (float) $collaborator->commission_share
                        : null,
                    'user' => $collaborator->relationLoaded('user') && $collaborator->user
                        ? [
                            'id' => $collaborator->user->id,
                            'name' => trim($collaborator->user->first_name.' '.$collaborator->user->last_name)
                                ?: $collaborator->user->username,
                            // Collaborator email is private team data — only surface it to
                            // authenticated viewers (agent dashboard), never on the public
                            // property page which eager-loads `collaborators.user`.
                            'email' => $request->user() ? $collaborator->user->email : null,
                        ]
                        : null,
                ])->values()->all()
            ),
            'agency' => $this->when(
                $isDetail || $this->resource->relationLoaded('agency'),
                fn () => $this->buildAgency()
            ),
            'documents' => $this->when($isDetail, fn () => $this->buildDocuments()),
            'price_history' => $this->when($isDetail, fn () => $this->buildPriceHistory()),
            'published_at' => $this->iso($this->published_at),
            'created_at' => $this->iso($this->created_at),
            // TCK-098 — moderation fields (always included so the agent dashboard
            // can render the status banner without a second round-trip).
            'rejection_reason' => $this->rejection_reason,
            'submitted_at' => $this->iso($this->submitted_at),
            'approved_at' => $this->iso($this->approved_at),
            'rejected_at' => $this->iso($this->rejected_at),
        ];
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
        if ($this->resource->relationLoaded('reviews')) {
            $reviews = $this->resource->reviews;
            if ($reviews->isEmpty()) {
                return null;
            }

            return round((float) $reviews->avg('rating'), 2);
        }

        $avg = $this->resource->reviews()->where('is_approved', true)->avg('rating');

        return $avg !== null ? round((float) $avg, 2) : null;
    }

    private function computeReviewsCount(): int
    {
        if ($this->resource->relationLoaded('reviews')) {
            return $this->resource->reviews->count();
        }

        return (int) $this->resource->reviews()->where('is_approved', true)->count();
    }

    /**
     * TCK-142 — `is_agent` used to derive from a now-dropped column. "Agent"
     * here means the owner holds a professional profile that can list
     * properties on behalf of the property's agency: an active AgentProfile
     * in that agency, or a BrokerProfile collaborating with it.
     */
    private function ownerActsAsAgent(User $owner): bool
    {
        $agency = $this->resource->agency;
        if ($agency !== null && $owner->isAgentAt($agency->id)) {
            return true;
        }

        return $owner->hasProfile(BrokerProfile::class);
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
            // TCK-177 — used to link the contact card to /agents/[slug].
            'slug' => $owner->username,
            'avatar_url' => $owner->getFirstMediaUrl('avatar') ?: null,
            'is_agent' => $this->ownerActsAsAgent($owner),
            'member_since' => $this->iso($owner->created_at),
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

    private function urlFor(Media $media, string $conversion): string
    {
        if (request()->boolean('raw') && Gate::allows('viewRaw', $media)) {
            return $media->getUrl();
        }

        return $media->getUrl($conversion);
    }

    /**
     * TCK-106 — `original` exposes the unwatermarked source file.
     * Only return it when the caller is authorized to view raw media,
     * otherwise fall back to the largest watermarked conversion (preview)
     * so public consumers cannot bypass the watermark.
     */
    private function originalUrlFor(Media $media): string
    {
        if (Gate::allows('viewRaw', $media)) {
            return $media->getUrl();
        }

        return $media->getUrl('preview');
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
            'changed_at' => $this->iso($entry->changed_at),
        ])->values()->all();
    }
}
