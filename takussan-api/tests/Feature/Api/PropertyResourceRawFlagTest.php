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
        // TCK-106 — `original` doit retomber sur une conversion FILIGRANÉE pour qui ne
        // peut pas voir le fichier brut, sinon le filigrane se contourne par cette URL.
        //
        // ⚠ TCK-356 — ce test épinglait le NOM de la conversion (`preview`). La propriété
        // gardée n'est pas ce nom : c'est « une conversion, filigranée, jamais la source ».
        // Le jour où le plafond public est monté de `preview` à `full`, l'assertion sur le
        // nom a rougi alors que la garde de TCK-106 tenait toujours — un test qui décrit
        // l'implémentation plutôt que la propriété rougit sur les bonnes modifications.
        $this->assertStringContainsString('/conversions/', $photos[0]['original']);
        $this->assertStringNotContainsString('photo.jpg', $photos[0]['original'],
            'Le fichier source ne doit jamais être servi à un appelant sans `viewRaw`.');

        $conversion = collect(Property::watermarkedConversions())
            ->first(fn (string $nom) => str_contains($photos[0]['original'], $nom));

        $this->assertNotNull($conversion,
            '`original` doit pointer sur une conversion couverte par Property::watermarkedConversions().');
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
