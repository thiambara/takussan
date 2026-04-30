<?php

namespace App\Observers;

use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\PropertyPriceHistory;
use App\Services\Property\SimilarPropertiesService;

class PropertyObserver
{
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
