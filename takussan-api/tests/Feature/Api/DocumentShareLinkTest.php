<?php

namespace Tests\Feature\Api;

use App\Models\Document;
use App\Models\DocumentShareLink;
use App\Models\Enums\DocumentType;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DocumentShareLinkTest extends TestCase
{
    use RefreshDatabase;

    private function createDocument(User $owner): Document
    {
        $property = Property::factory()->create(['user_id' => $owner->id]);

        return Document::create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $owner->id,
            'name' => 'Test Document',
            'type' => DocumentType::Other,
        ]);
    }

    public function test_owner_can_create_share_link(): void
    {
        $owner = User::factory()->create();
        $document = $this->createDocument($owner);

        Sanctum::actingAs($owner);

        $this->postJson("/api/documents/{$document->id}/share", [
            'expires_at' => now()->addDays(7)->toDateTimeString(),
        ])->assertStatus(201)
            ->assertJsonStructure(['data' => ['token', 'expires_at', 'has_password']]);

        $this->assertDatabaseHas('document_share_links', ['document_id' => $document->id]);
    }

    public function test_non_owner_cannot_create_share_link(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $document = $this->createDocument($owner);

        Sanctum::actingAs($other);

        $this->postJson("/api/documents/{$document->id}/share")
            ->assertForbidden();
    }

    public function test_public_access_via_valid_token(): void
    {
        $owner = User::factory()->create();
        $document = $this->createDocument($owner);

        Sanctum::actingAs($owner);

        $token = $this->postJson("/api/documents/{$document->id}/share")
            ->json('data.token');

        $this->getJson("/api/share/{$token}")
            ->assertOk()
            ->assertJsonStructure(['data' => ['token', 'document']]);
    }

    public function test_expired_link_returns_410(): void
    {
        $owner = User::factory()->create();
        $document = $this->createDocument($owner);

        $link = DocumentShareLink::create([
            'document_id' => $document->id,
            'created_by_id' => $owner->id,
            'token' => 'expired-token-123',
            'expires_at' => now()->subDay(),
            'downloads_count' => 0,
        ]);

        $this->getJson("/api/share/{$link->token}")->assertStatus(410);
    }

    public function test_revoked_link_returns_410(): void
    {
        $owner = User::factory()->create();
        $document = $this->createDocument($owner);

        $link = DocumentShareLink::create([
            'document_id' => $document->id,
            'created_by_id' => $owner->id,
            'token' => 'revoked-token-456',
            'expires_at' => now()->addDays(7),
            'revoked_at' => now(),
            'downloads_count' => 0,
        ]);

        $this->getJson("/api/share/{$link->token}")->assertStatus(410);
    }

    public function test_unknown_token_returns_404(): void
    {
        $this->getJson('/api/share/nonexistent-token')->assertStatus(404);
    }

    public function test_owner_can_revoke_link(): void
    {
        $owner = User::factory()->create();
        $document = $this->createDocument($owner);

        Sanctum::actingAs($owner);

        $linkId = $this->postJson("/api/documents/{$document->id}/share")
            ->json('data.id');

        $this->deleteJson("/api/documents/{$document->id}/share/{$linkId}")
            ->assertNoContent();

        $link = DocumentShareLink::find($linkId);
        $this->assertNotNull($link?->revoked_at);
    }

    public function test_password_protected_link_requires_password(): void
    {
        $owner = User::factory()->create();
        $document = $this->createDocument($owner);

        Sanctum::actingAs($owner);

        $token = $this->postJson("/api/documents/{$document->id}/share", [
            'password' => 'secret1234',
        ])->json('data.token');

        $this->getJson("/api/share/{$token}")->assertStatus(401);

        $this->getJson("/api/share/{$token}?password=secret1234")->assertOk();
    }
}
