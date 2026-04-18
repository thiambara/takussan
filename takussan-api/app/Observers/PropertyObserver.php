<?php

namespace App\Observers;

use App\Models\Property;
use App\Models\PropertyPriceHistory;

class PropertyObserver
{
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
    }

    public function created(Property $property): void
    {
        if ($property->agency_id) {
            $property->agency()->increment('properties_count');
        }
    }

    public function deleted(Property $property): void
    {
        if ($property->agency_id) {
            $property->agency()->decrement('properties_count');
        }
    }
}
