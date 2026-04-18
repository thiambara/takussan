<?php

namespace Tests\Feature\Observers;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertyObserverTest extends TestCase
{
    use RefreshDatabase;

    public function test_creating_property_increments_agency_properties_count(): void
    {
        $agency = Agency::factory()->create(['properties_count' => 0]);

        $property = Property::factory()->create([
            'agency_id' => $agency->id,
        ]);

        $this->assertEquals(1, $agency->fresh()->properties_count);
    }

    public function test_updating_property_price_creates_history(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $property = Property::factory()->create([
            'price' => 100000,
        ]);

        $property->update([
            'price' => 120000,
        ]);

        $this->assertDatabaseHas('property_price_histories', [
            'property_id' => $property->id,
            'old_price' => 100000,
            'new_price' => 120000,
            'changed_by_id' => $user->id,
        ]);
    }

    public function test_updating_other_fields_does_not_create_history(): void
    {
        $property = Property::factory()->create([
            'price' => 100000,
            'title' => 'Old Title',
        ]);

        $property->update([
            'title' => 'New Title',
        ]);

        $this->assertDatabaseEmpty('property_price_histories');
    }

    public function test_deleting_property_decrements_agency_properties_count(): void
    {
        $agency = Agency::factory()->create(['properties_count' => 1]);

        $property = Property::factory()->create([
            'agency_id' => $agency->id,
        ]);

        // factory create could increment, so it becomes 2.
        $this->assertEquals(2, $agency->fresh()->properties_count);

        $property->delete();

        $this->assertEquals(1, $agency->fresh()->properties_count);
    }
}
