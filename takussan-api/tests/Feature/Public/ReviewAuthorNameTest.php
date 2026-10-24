<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1781 (P175.05) — l'API ne rend plus de libellé pour un auteur sans nom : `author.name` est
 * nul, et le front écrit « Anonyme » dans la langue du lecteur (principe 5 de `CLAUDE.md`).
 * Avant, `ReviewResource` rendait `'Anonyme'` en dur, en français, au lecteur anglais aussi.
 */
class ReviewAuthorNameTest extends TestCase
{
    use RefreshDatabase;

    public function test_author_name_is_null_for_a_deleted_account(): void
    {
        $property = Property::factory()->published()->create();
        $author = User::factory()->create();
        $this->review($property, $author);
        $author->delete();

        $this->getJson("/api/public/properties/{$property->slug}/reviews")
            ->assertOk()
            ->assertJsonPath('data.0.author.name', null);
    }

    public function test_author_name_is_null_without_name_nor_username(): void
    {
        $property = Property::factory()->published()->create();
        $author = User::factory()->create(['first_name' => '', 'last_name' => '', 'username' => null]);
        $this->review($property, $author);

        $this->getJson("/api/public/properties/{$property->slug}/reviews")
            ->assertOk()
            ->assertJsonPath('data.0.author.id', $author->id)
            ->assertJsonPath('data.0.author.name', null);
    }

    public function test_author_name_is_the_full_name_when_present(): void
    {
        $property = Property::factory()->published()->create();
        $author = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $this->review($property, $author);

        $this->getJson("/api/public/properties/{$property->slug}/reviews")
            ->assertOk()
            ->assertJsonPath('data.0.author.name', 'Awa Ndiaye');
    }

    private function review(Property $property, User $author): void
    {
        Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $property->id,
            'author_id' => $author->id,
            'rating' => 4,
            'is_approved' => true,
            'approved_at' => now(),
        ]);
    }
}
