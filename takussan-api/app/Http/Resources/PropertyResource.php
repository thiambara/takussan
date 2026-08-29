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
            // TCK-336 — `whenHas`, et surtout PAS un accès nu, sur TOUTE clé adossée à une
            // COLONNE. Ces endpoints passent par `Property::buildQuery()`, donc par
            // `fields[properties]=…` de spatie, qui restreint le SELECT — y compris celui
            // d'un `include=property` imbriqué (mesuré : une Booking incluse avec
            // `fields[properties]=id,title,slug,price,currency` rend un modèle à 5 colonnes).
            // Un accès nu sur une colonne non sélectionnée ne rend pas « inconnu » : Eloquent
            // rend `null`, et les casts d'ici transformaient ce `null` en VALEUR MESUREE —
            // `price => 0`, `furnished => false`, `featured => false`, `views_count => 0`,
            // `favorites_count => 0`. Un bien à 0 F CFA, non meublé, jamais consulté : six
            // affirmations sur des colonnes dont la requête n'a rien lu.
            //
            // `whenHas` teste `array_key_exists(...getAttributes())` : une colonne
            // SELECTIONNEE qui vaut `null` reste donc émise à `null` — la distinction porte sur
            // « lue ou pas », jamais sur « nulle ou pas ». Même règle que
            // `UserResource::has_usable_password` (TCK-272) et que
            // `PaymentGatewayService::paymentAmount()` (ardoise D-51).
            //
            // ⚠ Les clés DÉRIVÉES restent inconditionnelles, et ce n'est pas un oubli :
            // `location`, `main_photo_url`, les cinq `*_label`, `photos`, `tags`,
            // `media_extra`, `average_rating`, `reviews_count`, `price_history`, `documents`
            // et les relations d'`include=` ne sont PAS des colonnes — elles ne peuvent pas
            // figurer dans `fields[properties]` (spatie rend 400 `InvalidFieldQuery`) et donc
            // aucun appelant ne peut les demander. Les gager sur `fields[]` les ferait
            // disparaître chez des appelants qui les affichent. L'arbitrage est posé dans
            // ADR-0021.
            //
            // *Une clé absente se remarque ; une clé fausse se croit.*
            'id' => $this->whenHas('id'),
            'reference_number' => $this->whenHas('reference_number'),
            'title' => $this->whenHas('title'),
            'slug' => $this->whenHas('slug'),
            'price' => $this->whenHas('price', fn ($valeur) => (float) $valeur),
            'currency' => $this->whenHas('currency', fn ($valeur) => $valeur?->value),
            'type' => $this->whenHas('type', fn ($valeur) => $valeur?->value),
            'type_label' => $this->enumLabel($this->type, 'properties.type'),
            'contract_type' => $this->whenHas('contract_type', fn ($valeur) => $valeur?->value),
            'contract_type_label' => $this->enumLabel($this->contract_type, 'properties.contract_type'),
            'rent_period' => $this->whenHas('rent_period', fn ($valeur) => $valeur?->value),
            'rent_period_label' => $this->enumLabel($this->rent_period, 'properties.rent_period'),
            'status' => $this->whenHas('status', fn ($valeur) => $valeur?->value),
            'status_label' => $this->enumLabel($this->status, 'properties.status'),
            'visibility' => $this->whenHas('visibility', fn ($valeur) => $valeur?->value),
            'title_type' => $this->whenHas('title_type', fn ($valeur) => $valeur?->value),
            'title_type_label' => $this->enumLabel($this->title_type, 'properties.title_type'),
            'location' => $this->buildLocation($address),
            'bedrooms' => $this->whenHas('bedrooms'),
            'bathrooms' => $this->whenHas('bathrooms'),
            'area' => $this->whenHas('area'),
            'floor_number' => $this->whenHas('floor_number'),
            'total_floors' => $this->whenHas('total_floors'),
            'year_built' => $this->whenHas('year_built'),
            'parking_spaces' => $this->whenHas('parking_spaces'),
            'available_from' => $this->whenHas('available_from', fn ($valeur) => $this->calendarDate($valeur)),
            'furnished' => $this->whenHas('furnished', fn ($valeur) => (bool) $valeur),
            'featured' => $this->whenHas('featured', fn ($valeur) => (bool) $valeur),
            // ⚠ `views_count` / `favorites_count` restent dans la FORME LISTE, et c'est mesuré :
            // `DASHBOARD_PROPERTY_FIELDS` (`takussan-web/src/lib/queries/properties-server.ts`)
            // les demande explicitement, et `PropertyList.tsx` les rend dans chaque ligne du
            // tableau de bord agent (lignes 267/272 en carte, 405/409 en tableau). Les passer
            // derrière `$isDetail` viderait cette colonne sans erreur TypeScript ni test rouge.
            'views_count' => $this->whenHas('views_count', fn ($valeur) => (int) ($valeur ?? 0)),
            'favorites_count' => $this->whenHas('favorites_count', fn ($valeur) => (int) ($valeur ?? 0)),
            'average_rating' => $this->when($isDetail, fn () => $this->computeAverageRating()),
            'reviews_count' => $this->when($isDetail, fn () => $this->computeReviewsCount()),
            'main_photo_url' => ($m = $this->getFirstMedia('photos')) ? $this->urlFor($m, 'preview') : null,
            'description' => $this->when($isDetail, fn () => $this->whenHas('description')),
            'photos' => $this->when(
                $isDetail,
                fn () => $this->getMedia('photos')->values()->map(fn (Media $media, int $index) => [
                    'id' => $media->id,
                    'thumbnail' => $this->urlFor($media, 'thumbnail'),
                    'preview' => $this->urlFor($media, 'preview'),
                    'full' => $this->urlFor($media, $this->largestPublicConversion($media)),
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
            'published_at' => $this->whenHas('published_at', fn ($valeur) => $this->iso($valeur)),
            'created_at' => $this->whenHas('created_at', fn ($valeur) => $this->iso($valeur)),
            // TCK-098 — moderation fields, so the agent dashboard can render the
            // status banner without a second round-trip. TCK-335 — that dashboard
            // is rendered from an AUTHENTICATED session, so gating them on
            // `$request->user()` costs it nothing; the same key already masks a
            // collaborator's email above. Anonymous callers were carrying 4 keys
            // that are null by construction on any public property
            // (`PropertyModerationService::approve()` clears `rejection_reason`
            // and `rejected_at`; `rejected`/`pending_review` are in
            // `NON_PUBLIC_STATUSES`) — 8.5% of the search payload, and a needless
            // disclosure of the moderation machinery. Absent, not null: a missing
            // key gets noticed, a null one gets believed.
            'rejection_reason' => $this->when(
                $request->user() !== null,
                fn () => $this->whenHas('rejection_reason'),
            ),
            'submitted_at' => $this->when(
                $request->user() !== null,
                fn () => $this->whenHas('submitted_at', fn ($valeur) => $this->iso($valeur)),
            ),
            'approved_at' => $this->when(
                $request->user() !== null,
                fn () => $this->whenHas('approved_at', fn ($valeur) => $this->iso($valeur)),
            ),
            'rejected_at' => $this->when(
                $request->user() !== null,
                fn () => $this->whenHas('rejected_at', fn ($valeur) => $this->iso($valeur)),
            ),
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
     * otherwise fall back to the largest watermarked conversion
     * so public consumers cannot bypass the watermark.
     */
    private function originalUrlFor(Media $media): string
    {
        if (Gate::allows('viewRaw', $media)) {
            return $media->getUrl();
        }

        return $media->getUrl($this->largestPublicConversion($media));
    }

    /**
     * TCK-356 — `full` (1600 px) est la plus grande conversion servie au public.
     *
     * Le repli sur `preview` n'est pas décoratif : `getUrl('full')` construit une
     * URL à partir du NOM de la conversion sans vérifier qu'elle a été produite.
     * Tant que le parc existant n'est pas régénéré, un média d'avant TCK-356 rendrait
     * donc une URL en 404. Ce repli tient la fenêtre entre le déploiement et la
     * régénération ; il devient inutile quand AC5 est vert (0 média sans `full`).
     */
    private function largestPublicConversion(Media $media): string
    {
        return $media->hasGeneratedConversion('full') ? 'full' : 'preview';
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
