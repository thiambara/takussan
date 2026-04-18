<?php

namespace Tests\Feature\Api;

use App\Models\Document;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReviewReportAndDocSearchTest extends TestCase
{
    use RefreshDatabase;

    // --- Review Reporting ---

    public function test_user_can_report_review(): void
    {
        $user = User::factory()->create();
        $review = Review::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson("/api/reviews/{$review->id}/report", [
            'reason' => 'Contenu inapproprié',
        ])->assertOk();

        $review->refresh();
        $this->assertTrue($review->metadata['reported']);
        $this->assertCount(1, $review->metadata['reports']);
        $this->assertEquals($user->id, $review->metadata['reports'][0]['user_id']);
    }

    public function test_report_requires_reason(): void
    {
        $user = User::factory()->create();
        $review = Review::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson("/api/reviews/{$review->id}/report", [])
            ->assertStatus(422);
    }

    public function test_multiple_reports_accumulate(): void
    {
        $review = Review::factory()->create();

        $user1 = User::factory()->create();
        Sanctum::actingAs($user1);
        $this->postJson("/api/reviews/{$review->id}/report", ['reason' => 'Spam'])->assertOk();

        $user2 = User::factory()->create();
        Sanctum::actingAs($user2);
        $this->postJson("/api/reviews/{$review->id}/report", ['reason' => 'Abusif'])->assertOk();

        $review->refresh();
        $this->assertCount(2, $review->metadata['reports']);
    }

    // --- Document Search ---

    public function test_document_search_by_name(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);

        Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
            'name' => 'Titre foncier',
        ]);

        Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
            'name' => 'Contrat de bail',
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/documents?q=foncier')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_document_search_returns_all_when_no_query(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);

        Document::factory()->count(3)->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/documents')->assertOk();
        $this->assertCount(3, $response->json('data'));
    }
}
