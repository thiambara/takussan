<?php

namespace Tests\Unit;

use App\Models\Address;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertySearchableArrayTest extends TestCase
{
    use RefreshDatabase;

    public function test_searchable_array_flattens_address_and_geo(): void
    {
        $property = Property::withoutSyncingToSearch(
            fn () => Property::factory()->published()->create([
                'type' => PropertyType::Apartment,
                'price' => 250000,
            ])
        );
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => 'Dakar',
            'neighborhood' => 'Almadies',
            'latitude' => 14.7,
            'longitude' => -17.5,
        ]);

        $arr = $property->fresh('address')->toSearchableArray();

        $this->assertSame('Dakar', $arr['city']);
        $this->assertSame('Almadies', $arr['neighborhood']);
        $this->assertSame(['lat' => 14.7, 'lng' => -17.5], $arr['_geo']);
        $this->assertSame(250000.0, $arr['price']);
        $this->assertStringContainsString('appartement', $arr['type_label']);
        $this->assertIsInt($arr['published_at']);
        $this->assertSame([], $arr['tags']);
    }

    public function test_searchable_array_omits_geo_when_no_coordinates(): void
    {
        $property = Property::withoutSyncingToSearch(
            fn () => Property::factory()->published()->create()
        );

        $this->assertArrayNotHasKey('_geo', $property->toSearchableArray());
    }
}
