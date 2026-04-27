<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PropertyResourceRawFlagTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function createSetup(): array
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create([
            'primary_admin_id' => $admin->id,
            'settings' => ['watermark_enabled' => true],
        ]);
        $admin->update(['agency_id' => $agency->id]);

        $property = Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $admin->id,
        ]);

        $property->addMedia(UploadedFile::fake()->image('photo.jpg'))
            ->usingFileName('photo.jpg')
            ->toMediaCollection('photos');

        return [$admin, $agency, $property];
    }

    public function test_default_returns_watermarked_urls(): void
    {
        [$admin, , $property] = $this->createSetup();

        $response = $this->actingAs($admin)
            ->getJson("/api/properties/{$property->id}");

        $response->assertStatus(200);
        $data = $response->json('data');
        $this->assertArrayHasKey('photos', $data);
    }

    public function test_raw_flag_returns_original_url_for_admin_agence(): void
    {
        [$admin, , $property] = $this->createSetup();

        $response = $this->actingAs($admin)
            ->getJson("/api/properties/{$property->id}?raw=1");

        $response->assertStatus(200);
        $data = $response->json('data');
        $this->assertArrayHasKey('photos', $data);
    }

    public function test_raw_flag_returns_403_for_public_visitor(): void
    {
        [, , $property] = $this->createSetup();
        $visitor = User::factory()->create();

        $property->addMedia(UploadedFile::fake()->image('photo2.jpg'))
            ->usingFileName('photo2.jpg')
            ->toMediaCollection('photos');

        $response = $this->actingAs($visitor)
            ->getJson("/api/properties/{$property->id}?raw=1");

        $response->assertStatus(403);
    }

    public function test_raw_flag_returns_403_for_agent_other_agency(): void
    {
        [, , $property] = $this->createSetup();

        $otherAdmin = User::factory()->create();
        $otherAgency = Agency::factory()->create(['primary_admin_id' => $otherAdmin->id]);
        $otherAdmin->update(['agency_id' => $otherAgency->id]);

        $response = $this->actingAs($otherAdmin)
            ->getJson("/api/properties/{$property->id}?raw=1");

        $response->assertStatus(403);
    }
}
