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

    public function test_default_hides_original_url_from_unauthorized_callers(): void
    {
        [, , $property] = $this->createSetup();

        $agent = User::factory()->create(['agency_id' => $property->agency_id]);

        $response = $this->actingAs($agent)
            ->getJson("/api/properties/{$property->id}");

        $response->assertStatus(200);
        $photos = $response->json('data.photos');
        $this->assertNotEmpty($photos);
        // The "original" field must fall back to the watermarked preview conversion
        // for callers who cannot view raw — otherwise the watermark is trivially
        // bypassed via the `original` URL.
        $this->assertStringContainsString('/conversions/', $photos[0]['original']);
        $this->assertStringContainsString('preview', $photos[0]['original']);
    }

    public function test_admin_agence_receives_original_url(): void
    {
        [$admin, , $property] = $this->createSetup();

        $response = $this->actingAs($admin)
            ->getJson("/api/properties/{$property->id}");

        $response->assertStatus(200);
        $photos = $response->json('data.photos');
        $this->assertNotEmpty($photos);
        // Primary admin passes the viewRaw policy — `original` is the source file.
        $this->assertStringNotContainsString('/conversions/', $photos[0]['original']);
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
