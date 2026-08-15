<?php

namespace Tests\Feature\Public;

use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertyTypesIndexTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_all_enum_values_even_when_db_is_empty(): void
    {
        $response = $this->getJson('/api/public/property-types');

        $response->assertOk()
            ->assertJsonCount(count(PropertyType::cases()), 'data');

        $values = collect($response->json('data'))->pluck('value')->all();
        foreach (PropertyType::cases() as $type) {
            $this->assertContains($type->value, $values);
        }

        foreach ($response->json('data') as $entry) {
            $this->assertSame(0, $entry['count']);
        }
    }

    public function test_counts_only_publicly_visible_properties(): void
    {
        Property::factory()->published()->count(3)->create(['type' => PropertyType::Apartment]);
        Property::factory()->published()->count(2)->create(['type' => PropertyType::Villa]);
        Property::factory()->draft()->create(['type' => PropertyType::Apartment]);

        $response = $this->getJson('/api/public/property-types')->assertOk();

        $byValue = collect($response->json('data'))->keyBy('value');

        $this->assertSame(3, $byValue['apartment']['count']);
        $this->assertSame(2, $byValue['villa']['count']);
        $this->assertSame(0, $byValue['house']['count']);
    }

    public function test_endpoint_is_public(): void
    {
        $this->getJson('/api/public/property-types')->assertOk();
    }
}
