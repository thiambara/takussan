<?php

namespace Tests\Feature\Search;

use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Scout\Searchable;
use Tests\TestCase;

class PropertyIndexTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['scout.driver' => 'collection']);
    }

    public function test_property_uses_searchable_trait(): void
    {
        $this->assertContains(
            Searchable::class,
            class_uses_recursive(Property::class)
        );
    }

    public function test_save_adds_property_to_index(): void
    {
        $property = Property::factory()->published()->create([
            'title' => 'Spacious family home with garden',
        ]);

        $this->assertCount(1, Property::search('spacious')->get());
        $this->assertCount(1, Property::search('garden')->get());
        $this->assertTrue(Property::search('spacious')->get()->first()->is($property));
    }

    public function test_update_refreshes_index_entry(): void
    {
        $property = Property::factory()->published()->create([
            'title' => 'Original title xylophone',
        ]);

        $this->assertCount(1, Property::search('xylophone')->get());

        $property->update(['title' => 'Brand new quartermaster loft']);

        $this->assertCount(0, Property::search('xylophone')->get());
        $this->assertCount(1, Property::search('quartermaster')->get());
    }

    public function test_delete_removes_property_from_index(): void
    {
        $property = Property::factory()->published()->create([
            'title' => 'Eviction candidate bungalow',
        ]);

        $this->assertCount(1, Property::search('eviction')->get());

        $property->delete();

        $this->assertCount(0, Property::search('eviction')->get());
    }

    public function test_draft_or_private_properties_are_not_indexed(): void
    {
        // Non-searchable via shouldBeSearchable(): draft status.
        Property::factory()->create([
            'title' => 'Hidden draft listing unicornium',
            'status' => PropertyStatus::Draft,
            'visibility' => PropertyVisibility::Public,
        ]);

        // Non-searchable via shouldBeSearchable(): private visibility.
        Property::factory()->create([
            'title' => 'Private showcase listing unicornium',
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Private,
        ]);

        $this->assertCount(0, Property::search('unicornium')->get());
    }

    public function test_becoming_published_enables_indexing(): void
    {
        $property = Property::factory()->create([
            'title' => 'Dormant listing stegosaurus',
            'status' => PropertyStatus::Draft,
            'visibility' => PropertyVisibility::Public,
        ]);

        $this->assertCount(0, Property::search('stegosaurus')->get());

        $property->update([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
        ]);

        $this->assertCount(1, Property::search('stegosaurus')->get());
    }
}
