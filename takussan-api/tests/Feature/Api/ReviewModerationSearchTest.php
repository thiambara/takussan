<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-2930 (AC1) — `filter[search]` sur la file des avis : le titre et la référence du bien, le nom
 * de l'auteur, le nom de l'agent noté ; insensible à la casse (ADR-0025) et borné au périmètre du
 * modérateur (ADR-0043 §1).
 */
class ReviewModerationSearchTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agencyA;

    private Agency $agencyB;

    private User $adminA;

    private User $adminB;

    private Review $onVilla;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agencyA = Agency::factory()->create();
        $this->agencyB = Agency::factory()->create();
        $this->adminA = User::factory()->create(['first_name' => 'Admin', 'last_name' => 'Alpha']);
        $this->materializeRoleProfile($this->adminA, 'agency_admin', $this->agencyA);
        $this->adminB = User::factory()->create(['first_name' => 'Admin', 'last_name' => 'Bravo']);
        $this->materializeRoleProfile($this->adminB, 'agency_admin', $this->agencyB);

        $villa = Property::factory()->create([
            'agency_id' => $this->agencyA->id, 'title' => 'Villa Sacré-Cœur', 'reference_number' => 'TK-VSC-001',
        ]);
        $this->onVilla = $this->review($villa, $this->person('Moussa', 'Fall'));
        // Le bruit : un autre bien de A, sans rien en commun avec les recherches.
        $this->review(Property::factory()->create([
            'agency_id' => $this->agencyA->id, 'title' => 'Appartement Plateau', 'reference_number' => 'TK-APL-002',
        ]), $this->person('Awa', 'Sarr'));
    }

    private function person(string $first, string $last): User
    {
        return User::factory()->create(['first_name' => $first, 'last_name' => $last, 'username' => strtolower($first.'.'.$last.'.'.uniqid())]);
    }

    private function review(Property|User $subject, User $author, array $attributes = []): Review
    {
        return Review::factory()->create(array_merge([
            'reviewable_type' => $subject::class,
            'reviewable_id' => $subject->id,
            'author_id' => $author->id,
            'title' => 'Séjour',
            'content' => 'Rien à signaler.',
            'status' => ReviewStatus::Pending,
            'is_approved' => false,
        ], $attributes));
    }

    /** @return list<int> */
    private function search(string $term): array
    {
        return collect($this->getJson('/api/reviews?filter[search]='.rawurlencode($term))->assertOk()->json('data'))
            ->pluck('id')->all();
    }

    public function test_the_property_title_is_found_in_any_case_within_the_scope_only(): void
    {
        $this->actingAsApi($this->adminA);
        $this->assertSame([$this->onVilla->id], $this->search('sacré'));
        $this->assertSame([$this->onVilla->id], $this->search('SACRÉ'));
        $this->assertSame([$this->onVilla->id], $this->search('tk-vsc'));

        $this->actingAsApi($this->adminB);
        $this->assertSame([], $this->search('sacré'));
    }

    public function test_the_author_name_is_found_word_by_word(): void
    {
        $byFatou = $this->review(Property::factory()->create(['agency_id' => $this->agencyA->id, 'title' => 'Studio Mermoz']), $this->person('Fatou', 'Ndiaye'));
        // Le même nom dans l'agence B : jamais rendu à l'admin de A.
        $this->review(Property::factory()->create(['agency_id' => $this->agencyB->id, 'title' => 'Studio Ngor']), $this->person('Fatou', 'Ndiaye'));

        $this->actingAsApi($this->adminA);
        $this->assertSame([$byFatou->id], $this->search('ndiaye'));
        $this->assertSame([$byFatou->id], $this->search('Fatou NDIAYE'));
        $this->assertSame([], $this->search('Fatou Sarr'));
    }

    public function test_the_rated_agent_name_is_found(): void
    {
        $agent = $this->person('Ibrahima', 'Diop');
        $onAgent = $this->review($agent, $this->person('Khady', 'Ba'), ['agency_id' => $this->agencyA->id]);

        $this->actingAsApi($this->adminA);
        $this->assertSame([$onAgent->id], $this->search('diop'));
    }

    public function test_an_empty_search_changes_nothing_and_the_risk_counts_follow_the_search(): void
    {
        $this->actingAsApi($this->adminA);
        $this->assertCount(2, $this->search('  '));

        $meta = $this->getJson('/api/reviews?filter[search]=sacr%C3%A9')->assertOk()->json('meta.risk_counts');
        $this->assertSame(1, array_sum($meta));
    }
}
