<?php

namespace Tests\Feature\Reviews;

use App\Models\Agency;
use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-2672 (AC2) — la file des avis se filtre, se trie et se compte par risque, en SQL, sur toute
 * la file : `meta.risk_counts` porte sur la file filtrée AVANT le filtre de risque.
 */
class ReviewRiskQueueTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agency);
        $this->property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $this->actingAsApi($admin);
    }

    /** @param  array<string, mixed>  $attributes */
    private function review(array $attributes = []): Review
    {
        return Review::factory()->create($attributes + [
            'reviewable_type' => Property::class, 'reviewable_id' => $this->property->id,
            'status' => ReviewStatus::Pending, 'is_approved' => false,
            'rating' => 5, 'title' => 'Bon séjour', 'content' => 'Appartement propre et calme.', 'reported_count' => 0,
        ]);
    }

    private function fileDe55(): void
    {
        foreach (range(1, 51) as $i) {
            $this->review(['rating' => 4 + ($i % 2)]);
        }
        $this->review(['rating' => 3]);
        $this->review(['reported_count' => 1]);
        $this->review(['content' => 'Appelez-moi au 77 418 90 22']);
        $this->review(['content' => 'voir www.ailleurs.sn']);
    }

    public function test_ac2_filtre_low_et_comptes(): void
    {
        $this->fileDe55();

        $response = $this->getJson('/api/reviews?filter[risk]=low&per_page=100')->assertOk()
            ->assertJsonPath('meta.total', 51)
            ->assertJsonPath('meta.risk_counts', ['high' => 4, 'low' => 51]);
        $this->assertCount(51, $response->json('data'));
        $this->assertSame(['low'], collect($response->json('data'))->pluck('risk.level')->unique()->values()->all());
    }

    public function test_filtre_high_et_les_raisons_rendues(): void
    {
        $this->fileDe55();

        $data = $this->getJson('/api/reviews?filter[risk]=high')->assertOk()
            ->assertJsonPath('meta.total', 4)
            ->assertJsonPath('meta.risk_counts', ['high' => 4, 'low' => 51])
            ->json('data');
        $this->assertEqualsCanonicalizing(
            ['low_rating', 'reported', 'contact_details', 'contact_details'],
            collect($data)->pluck('risk.reasons')->flatten()->all(),
        );
    }

    public function test_les_comptes_suivent_les_autres_filtres(): void
    {
        $this->fileDe55();
        $this->review(['status' => ReviewStatus::Approved, 'is_approved' => true, 'rating' => 1]);

        $this->getJson('/api/reviews?filter[moderation_status]=pending')->assertOk()
            ->assertJsonPath('meta.risk_counts', ['high' => 4, 'low' => 51]);
        $this->getJson('/api/reviews')->assertOk()
            ->assertJsonPath('meta.risk_counts', ['high' => 5, 'low' => 51]);
    }

    public function test_tri_par_risque(): void
    {
        $low = $this->review();
        $high = $this->review(['rating' => 1]);

        $this->assertSame([$high->id, $low->id], collect($this->getJson('/api/reviews?sort=risk,id')->json('data'))->pluck('id')->all());
        $this->assertSame([$low->id, $high->id], collect($this->getJson('/api/reviews?sort=-risk,id')->json('data'))->pluck('id')->all());
    }

    public function test_une_valeur_inconnue_ne_filtre_pas(): void
    {
        $this->review();
        $this->review(['rating' => 1]);

        $this->getJson('/api/reviews?filter[risk]=moyen')->assertOk()->assertJsonPath('meta.total', 2);
        $this->getJson('/api/reviews?filter[risk][]=low')->assertOk()->assertJsonPath('meta.total', 2);
    }

    public function test_le_risque_n_est_pas_rendu_a_l_auteur(): void
    {
        $author = User::factory()->create();
        $this->review(['author_id' => $author->id, 'rating' => 1]);
        $this->actingAsApi($author);

        $data = $this->getJson('/api/reviews?filter[author_id]=me')->assertOk()->json('data');
        $this->assertCount(1, $data);
        $this->assertArrayNotHasKey('risk', $data[0]);

        // Vérification adverse — ni par le compteur, ni par le filtre, ni par le tri : un avis sans
        // risque (5★, non signalé) avant l'avis à risque, et l'ordre ne bouge pas sous `sort=risk`.
        $calme = $this->review(['author_id' => $author->id, 'rating' => 5]);
        $page = $this->getJson('/api/reviews?filter[author_id]=me&filter[risk]=high&sort=risk,-id')->assertOk();
        $this->assertNull($page->json('meta.risk_counts'));
        $this->assertCount(2, $page->json('data'), 'filter[risk] ignoré');
        $this->assertSame(
            array_column($this->getJson('/api/reviews?filter[author_id]=me&sort=-id')->json('data'), 'id'),
            array_column($page->json('data'), 'id'),
            'sort=risk ignoré',
        );
        $this->assertContains($calme->id, array_column($page->json('data'), 'id'));
    }
}
