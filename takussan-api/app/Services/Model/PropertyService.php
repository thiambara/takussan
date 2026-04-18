<?php

namespace App\Services\Model;

use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Support\Str;

class PropertyService
{
    public function publish(Property $property): Property
    {
        abort_if(
            in_array($property->status, [PropertyStatus::Sold, PropertyStatus::Rented], true),
            422,
            'Cannot publish a sold or rented property.'
        );

        $property->update([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'published_at' => $property->published_at ?? now(),
        ]);

        return $property->refresh();
    }

    public function unpublish(Property $property): Property
    {
        $property->update(['visibility' => PropertyVisibility::Private]);

        return $property->refresh();
    }

    public function incrementViews(Property $property): void
    {
        $property->increment('views_count');
    }

    public function generateSlug(string $title): string
    {
        $base = Str::slug($title);
        $slug = $base.'-'.Str::random(6);

        while (Property::where('slug', $slug)->exists()) {
            $slug = $base.'-'.Str::random(6);
        }

        return $slug;
    }

}
