<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\TestCase;

class SignMediaEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');

        config([
            'cdn.enabled' => true,
            'cdn.base_url' => 'https://cdn.example.com',
            'cdn.signing_key' => 'test-secret',
            'cdn.signature_ttl' => 300,
            'cdn.secure_collections' => ['lease_documents'],
            'cdn.provider' => 'bunny',
        ]);
    }

    private function createMediaForUser(User $user): Media
    {
        return $user->addMedia(UploadedFile::fake()->image('photo.jpg'))
            ->usingFileName('photo.jpg')
            ->toMediaCollection('photos');
    }

    public function test_guest_cannot_sign_media(): void
    {
        $user = User::factory()->create();
        $media = $this->createMediaForUser($user);

        $this->getJson("/api/media/{$media->id}/sign")
            ->assertUnauthorized();
    }

    public function test_owner_receives_signed_url(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $media = $this->createMediaForUser($user);

        $response = $this->getJson("/api/media/{$media->id}/sign");

        $response->assertOk()
            ->assertJsonStructure(['url', 'expires_at']);
    }

    public function test_non_owner_is_forbidden(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $media = $this->createMediaForUser($owner);

        Sanctum::actingAs($other);

        $this->getJson("/api/media/{$media->id}/sign")
            ->assertForbidden();
    }

    public function test_signed_url_expires_within_configured_ttl(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $media = $this->createMediaForUser($user);

        $ttl = (int) config('cdn.signature_ttl');

        $response = $this->getJson("/api/media/{$media->id}/sign");
        $response->assertOk();

        $expiresAt = $response->json('expires_at');
        $expiresTs = strtotime($expiresAt);

        $this->assertGreaterThan(time(), $expiresTs);
        $this->assertLessThanOrEqual(time() + $ttl + 5, $expiresTs);
    }
}
