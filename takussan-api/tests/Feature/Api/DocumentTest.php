<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DocumentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Storage::fake('local');
    }

    public function test_owner_can_upload_document_to_property(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson('/api/documents', [
            'documentable_type' => 'property',
            'documentable_id' => $property->id,
            'name' => 'Title deed',
            'type' => DocumentType::Other->value,
            'file' => UploadedFile::fake()->create('deed.pdf', 100, 'application/pdf'),
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Title deed')
            ->assertJsonPath('data.type', DocumentType::Other->value);

        $this->assertDatabaseCount('documents', 1);
    }

    public function test_random_user_cannot_upload_document_to_property_they_dont_own(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $other = User::factory()->create();

        Sanctum::actingAs($other);

        $this->postJson('/api/documents', [
            'documentable_type' => 'property',
            'documentable_id' => $property->id,
            'name' => 'Title deed',
            'type' => DocumentType::Other->value,
            'file' => UploadedFile::fake()->create('deed.pdf', 100, 'application/pdf'),
        ])->assertNotFound()
            ->assertJsonPath('code', 'document.owner_not_found');
    }

    /**
     * TCK-732 (P03.06) — un porteur interdit et un porteur introuvable rendent la même réponse :
     * sans cela, `POST /api/documents` dit si un bien d'une autre agence existe.
     */
    public function test_forbidden_owner_and_missing_owner_get_the_same_response(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $other = User::factory()->create();

        Sanctum::actingAs($other);

        $post = fn (int $id) => $this->postJson('/api/documents', [
            'documentable_type' => 'property',
            'documentable_id' => $id,
            'name' => 'Title deed',
            'type' => DocumentType::Other->value,
            'file' => UploadedFile::fake()->create('deed.pdf', 100, 'application/pdf'),
        ]);

        $interdit = $post($property->id);
        $introuvable = $post($property->id + 1000);

        $introuvable->assertNotFound();
        $this->assertSame($introuvable->status(), $interdit->status());
        $this->assertSame($introuvable->json(), $interdit->json());
        $this->assertDatabaseCount('documents', 0);
    }

    public function test_unsupported_documentable_type_returns_422(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/documents', [
            'documentable_type' => 'unsupported',
            'documentable_id' => 1,
            'name' => 'Test',
            'type' => DocumentType::Other->value,
            'file' => UploadedFile::fake()->create('x.pdf', 10, 'application/pdf'),
        ])->assertStatus(422);
    }

    public function test_missing_file_returns_422(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson('/api/documents', [
            'documentable_type' => 'property',
            'documentable_id' => $property->id,
            'name' => 'Test',
            'type' => DocumentType::Other->value,
        ])->assertStatus(422);
    }

    public function test_invalid_type_returns_422(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson('/api/documents', [
            'documentable_type' => 'property',
            'documentable_id' => $property->id,
            'name' => 'Test',
            'type' => 'not_a_type',
            'file' => UploadedFile::fake()->create('x.pdf', 10, 'application/pdf'),
        ])->assertStatus(422);
    }

    public function test_owner_sees_own_documents_only_by_default(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();

        $propertyA = Property::factory()->create(['user_id' => $userA->id]);
        $propertyB = Property::factory()->create(['user_id' => $userB->id]);

        Document::factory()->create([
            'documentable_id' => $propertyA->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $userA->id,
        ]);
        Document::factory()->create([
            'documentable_id' => $propertyB->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $userB->id,
        ]);

        Sanctum::actingAs($userA);

        $response = $this->getJson('/api/documents')->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    public function test_uploader_can_delete_own_document(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);

        $document = Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->deleteJson("/api/documents/{$document->id}")->assertNoContent();
        $this->assertSoftDeleted('documents', ['id' => $document->id]);
    }

    public function test_non_uploader_cannot_delete_document(): void
    {
        $uploader = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $uploader->id]);

        $document = Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $uploader->id,
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->deleteJson("/api/documents/{$document->id}")->assertForbidden();
    }

    /**
     * TCK-1062 (P64.03) — une pièce de profil vérifiée ne se supprime plus par son titulaire :
     * le fichier, sinon, partait 90 jours plus tard par `media:cleanup`. Non vérifiée, elle se
     * supprime toujours.
     */
    public function test_holder_cannot_delete_verified_profile_piece(): void
    {
        $user = User::factory()->create();
        $profile = OwnerProfile::factory()->create(['user_id' => $user->id]);
        $piece = fn (bool $verified) => Document::factory()->create([
            'documentable_id' => $profile->id,
            'documentable_type' => OwnerProfile::class,
            'uploaded_by' => $user->id,
            'type' => DocumentType::Rib->value,
            'is_verified' => $verified,
        ]);
        $verifiee = $piece(true);
        $nonVerifiee = $piece(false);

        Sanctum::actingAs($user);

        $this->deleteJson("/api/documents/{$verifiee->id}")->assertForbidden();
        $this->assertNotSoftDeleted('documents', ['id' => $verifiee->id]);

        $this->deleteJson("/api/documents/{$nonVerifiee->id}")->assertNoContent();
        $this->assertSoftDeleted('documents', ['id' => $nonVerifiee->id]);
    }

    public function test_admin_can_verify_document(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($admin, 'super_admin');

        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);
        $document = Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
        ]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/documents/{$document->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.is_verified', true);
    }

    public function test_non_admin_cannot_verify_document(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);
        $document = Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->postJson("/api/documents/{$document->id}/verify")->assertForbidden();
    }
}
