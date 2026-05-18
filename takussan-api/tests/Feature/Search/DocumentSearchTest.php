<?php

namespace Tests\Feature\Search;

use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-094 — Full-text search on documents.
 *
 * AC2: scoped to documents accessible via ownership/upload.
 * AC3: q < 2 chars → 422.
 * AC6: sort=relevance (default) + sort=-created_at.
 */
class DocumentSearchTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['scout.driver' => 'collection']);
    }

    public function test_search_returns_only_documents_user_can_access(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $property = Property::factory()->create(['user_id' => $user->id]);

        // Document uploaded by user (accessible)
        Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
            'name' => 'bail dupont',
            'type' => DocumentType::LeaseContract,
        ]);

        // Document uploaded by other user on other's property (not accessible)
        $otherProperty = Property::factory()->create(['user_id' => $other->id]);
        Document::factory()->create([
            'documentable_id' => $otherProperty->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $other->id,
            'name' => 'bail martin',
            'type' => DocumentType::LeaseContract,
        ]);

        $response = $this->actingAs($user)
            ->getJson('/api/search/documents?q=bail');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonFragment(['uploaded_by' => $user->id]);
    }

    public function test_short_query_returns_422(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/search/documents?q=b')
            ->assertUnprocessable();
    }

    public function test_missing_query_returns_422(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/search/documents')
            ->assertUnprocessable();
    }

    public function test_filter_by_document_type(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);

        Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
            'name' => 'contrat location alpha',
            'type' => DocumentType::LeaseContract,
        ]);

        Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
            'name' => 'contrat assurance beta',
            'type' => DocumentType::Insurance,
        ]);

        $response = $this->actingAs($user)
            ->getJson('/api/search/documents?q=contrat&filter[type]=lease_contract');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
    }

    public function test_sort_by_created_at_descending(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);

        $older = Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
            'name' => 'facture ancien doc',
            'type' => DocumentType::Invoice,
            'created_at' => now()->subDays(5),
        ]);

        $newer = Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
            'name' => 'facture récent doc',
            'type' => DocumentType::Invoice,
            'created_at' => now(),
        ]);

        $response = $this->actingAs($user)
            ->getJson('/api/search/documents?q=facture&sort=-created_at');

        $response->assertOk();
        $data = $response->json('data');
        $this->assertCount(2, $data);
        $this->assertEquals($newer->id, $data[0]['id']);
        $this->assertEquals($older->id, $data[1]['id']);
    }

    public function test_pagination_defaults_to_20(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);

        Document::factory()->count(25)->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
            'name' => 'testpagination doc unique',
            'type' => DocumentType::Other,
        ]);

        $response = $this->actingAs($user)
            ->getJson('/api/search/documents?q=testpagination');

        $response->assertOk();
        $this->assertCount(20, $response->json('data'));
        $this->assertEquals(25, $response->json('meta.total'));
    }

    public function test_per_page_max_is_50(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/search/documents?q=test&per_page=100')
            ->assertUnprocessable();
    }

    public function test_soft_deleted_documents_excluded(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);

        $doc = Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
            'name' => 'supprimé invisible document',
            'type' => DocumentType::Other,
        ]);

        $doc->delete(); // soft-delete

        $response = $this->actingAs($user)
            ->getJson('/api/search/documents?q=supprimé');

        $response->assertOk();
        $response->assertJsonCount(0, 'data');
    }

    public function test_unauthenticated_returns_401(): void
    {
        $this->getJson('/api/search/documents?q=test')
            ->assertUnauthorized();
    }

    public function test_date_range_filter(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);

        Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
            'name' => 'daterange plage test',
            'type' => DocumentType::Other,
            'created_at' => now()->subDays(30),
        ]);

        Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
            'name' => 'daterange plage test',
            'type' => DocumentType::Other,
            'created_at' => now()->subDays(2),
        ]);

        $from = now()->subDays(7)->toDateString();
        $to = now()->toDateString();

        $response = $this->actingAs($user)
            ->getJson("/api/search/documents?q=daterange&filter[date_from]={$from}&filter[date_to]={$to}");

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
    }

    public function test_admin_can_see_all_documents(): void
    {
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'super_admin');

        $other = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $other->id]);

        Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $other->id,
            'name' => 'adminvisible confidentiel doc',
            'type' => DocumentType::Other,
        ]);

        $response = $this->actingAs($admin)
            ->getJson('/api/search/documents?q=adminvisible');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
    }
}
