<?php

namespace App\Observers;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyPriceHistory;
use App\Services\Property\SimilarPropertiesService;

class PropertyObserver
{
    /**
     * TCK-597 — les statuts sous lesquels un bien s'AFFICHE : ceux que `Property::scopePublic()`
     * n'exclut pas (territoire de TCK-600 — la liste n'y est pas réécrite, elle est lue ici).
     */
    private const DISPLAYABLE_STATUSES = [
        PropertyStatus::Available,
        PropertyStatus::Published,
        PropertyStatus::Pending,
    ];

    /** TCK-597 (ADR-0043 §5) — une ACTIVATION part d'un de ces statuts… */
    private const PRE_ACTIVATION_STATUSES = [
        PropertyStatus::Draft,
        PropertyStatus::PendingReview,
        PropertyStatus::Rejected,
    ];

    /** …vers un de ceux-ci. `archived`/`unavailable` → `available` n'en est pas une. */
    private const ACTIVE_STATUSES = [
        PropertyStatus::Available,
        PropertyStatus::Published,
    ];

    public function creating(Property $property): void
    {
        if (! $property->agency_id) {
            return;
        }

        $agency = $property->agency ?? $property->agency()->first();
        if (! $agency?->moderation_required) {
            return;
        }

        // Agency requires moderation: intercept any activation attempt and
        // put the property into the review queue instead.
        $activatableStatuses = [
            PropertyStatus::Available,
            PropertyStatus::Published,
        ];

        if (in_array($property->status, $activatableStatuses, true)) {
            $property->status = PropertyStatus::PendingReview;
            $property->submitted_at = now();
        }
    }

    /**
     * TCK-597 (ADR-0043 §4, §5) — UN point pour toute sauvegarde Eloquent d'un bien : `publish`,
     * `PUT …/status`, `PUT …/visibility`, `PUT …/{id}`, un lot, un `fill()`, un `update()` direct.
     *
     *  1. **Verrou plateforme** : tant que `platform_hold_at` est posé, rien ne rend le bien public,
     *     et rien ne lève le verrou hors de {@see Property::withoutModerationGate()} (422
     *     `moderation.platform_hold`).
     *  2. **Modération d'agence** : une activation (`draft`/`pending_review`/`rejected` →
     *     `available`/`published`) d'un bien d'une agence `moderation_required` atterrit en
     *     `pending_review`, comme à `creating`. Pas d'exemption par rôle.
     *
     * TCK-599 possède `updated` ; TCK-597 n'écrit que cette méthode.
     */
    public function updating(Property $property): void
    {
        if (Property::moderationGateBypassed()) {
            return;
        }

        $this->guardPlatformHold($property);
        $this->routeActivationThroughModeration($property);
    }

    private function guardPlatformHold(Property $property): void
    {
        $wasHeld = $property->getOriginal('platform_hold_at') !== null;

        abort_code_if(
            $wasHeld && $property->platform_hold_at === null,
            422,
            'moderation.platform_hold',
        );

        if ($property->platform_hold_at === null) {
            return;
        }

        $becomesPublic = ($property->isDirty('status') && in_array($property->status, self::DISPLAYABLE_STATUSES, true))
            || ($property->isDirty('visibility') && $property->visibility === PropertyVisibility::Public)
            || ($property->isDirty('published_at') && $property->published_at !== null);

        abort_code_if($becomesPublic, 422, 'moderation.platform_hold');
    }

    private function routeActivationThroughModeration(Property $property): void
    {
        if (! $property->isDirty('status') || ! $property->agency_id) {
            return;
        }

        $from = $property->getOriginal('status');
        if (! in_array($from, self::PRE_ACTIVATION_STATUSES, true)
            || ! in_array($property->status, self::ACTIVE_STATUSES, true)) {
            return;
        }

        $moderated = (bool) Agency::query()->whereKey($property->agency_id)->value('moderation_required');
        if (! $moderated) {
            return;
        }

        $keepsSubmission = $from === PropertyStatus::PendingReview && $property->getOriginal('submitted_at') !== null;

        $property->status = PropertyStatus::PendingReview;
        if (! $keepsSubmission) {
            $property->submitted_at = now();
        }
    }

    public function updated(Property $property): void
    {
        if ($property->wasChanged('price') && $property->getOriginal('price') !== null) {
            PropertyPriceHistory::create([
                'property_id' => $property->id,
                'old_price' => $property->getOriginal('price'),
                'new_price' => $property->price,
                'currency' => $property->currency?->value ?? 'XOF',
                'changed_at' => now(),
                'changed_by_id' => auth()->id(),
            ]);
        }

        app(SimilarPropertiesService::class)->invalidateForProperty($property);
    }

    public function created(Property $property): void
    {
        if ($property->agency_id) {
            $property->agency()->increment('properties_count');
        }

        app(SimilarPropertiesService::class)->invalidateForProperty($property);
    }

    public function deleted(Property $property): void
    {
        if ($property->agency_id) {
            $property->agency()->decrement('properties_count');
        }

        app(SimilarPropertiesService::class)->invalidateForProperty($property);
    }
}
