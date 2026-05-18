<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-163 — verifies that fixtures flagged `is_test=true` never reach
 * the public surface, while the dashboard endpoints (`/api/properties`)
 * stay opt-in and still see them.
 */
class PropertyIsTestExclusionTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_index_excludes_is_test_properties(): void
    {
        Property::factory()->published()->create(['title' => 'Real Listing', 'is_test' => false]);
        Property::factory()->published()->create(['title' => 'Property Test Filter - abcd', 'is_test' => true]);

        $titles = collect($this->getJson('/api/public/properties')->json('data'))
            ->pluck('title')
            ->all();

        $this->assertContains('Real Listing', $titles);
        $this->assertNotContains('Property Test Filter - abcd', $titles);
    }

    public function test_public_search_excludes_is_test_properties(): void
    {
        Property::factory()->published()->create(['title' => 'Searchable Real', 'is_test' => false]);
        Property::factory()->published()->create(['title' => 'Searchable Test Fixture', 'is_test' => true]);

        $titles = collect($this->getJson('/api/public/properties/search')->json('data'))
            ->pluck('title')
            ->all();

        $this->assertContains('Searchable Real', $titles);
        $this->assertNotContains('Searchable Test Fixture', $titles);
    }

    public function test_public_show_returns_404_for_is_test_properties(): void
    {
        $property = Property::factory()->published()->create(['is_test' => true]);

        $this->getJson("/api/public/properties/{$property->slug}")->assertNotFound();
    }

    public function test_flag_test_command_marks_fixtures(): void
    {
        $real = Property::factory()->published()->create(['title' => 'Real Apartment', 'is_test' => false]);
        $fixture = Property::factory()->published()->create(['title' => 'Property Test Filter - xyz', 'is_test' => false]);

        $this->artisan('properties:flag-test')->assertSuccessful();

        $this->assertFalse($real->refresh()->is_test);
        $this->assertTrue($fixture->refresh()->is_test);
    }
}
