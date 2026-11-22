<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\ReviewStatus;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2863 (AC1) — la boîte des avis reçus porte la répartition 5→1 de ses avis publiés et le
 * nombre d'avis qui attendent leur validation, sur tout l'ensemble, quelle que soit la page.
 */
class ReceivedReviewsMetaTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
    }

    private function review(User $subject, int $rating, ReviewStatus $status = ReviewStatus::Approved): Review
    {
        return Review::factory()->create([
            'reviewable_type' => User::class,
            'reviewable_id' => $subject->id,
            'agency_id' => $this->agency->id,
            'rating' => $rating,
            'status' => $status,
            'is_approved' => in_array($status, [ReviewStatus::Approved, ReviewStatus::Reported], true),
        ]);
    }

    public function test_ac1_la_repartition_compte_les_avis_publies_et_le_compte_les_avis_en_attente_a_chaque_page(): void
    {
        foreach ([5, 5, 5, 5, 3] as $note) {
            $this->review($this->agent, $note);
        }
        $this->review($this->agent, 1, ReviewStatus::Pending);
        // Un avis rejeté ne compte nulle part ; l'avis d'un autre agent non plus.
        $this->review($this->agent, 2, ReviewStatus::Rejected);
        $autre = User::factory()->create();
        $this->materializeRoleProfile($autre, 'agent', $this->agency);
        $this->review($autre, 4);
        $this->review($autre, 4, ReviewStatus::Pending);

        $this->actingAsApi($this->agent);
        foreach ([1, 2] as $page) {
            $this->getJson("/api/reviews/received?per_page=2&page={$page}")
                ->assertOk()
                ->assertJsonCount(2, 'data')
                ->assertJsonPath('meta.distribution', ['5' => 4, '4' => 0, '3' => 1, '2' => 0, '1' => 0])
                ->assertJsonPath('meta.pending_count', 1)
                ->assertJsonPath('meta.total', 5);
        }
    }

    public function test_le_filtre_de_statut_choisit_l_onglet_sans_changer_les_comptes(): void
    {
        $this->review($this->agent, 4);
        $this->review($this->agent, 2, ReviewStatus::Pending);

        $this->actingAsApi($this->agent);
        $this->getJson('/api/reviews/received?filter[status]=pending')
            ->assertOk()
            ->assertJsonPath('meta.distribution.4', 1)
            ->assertJsonPath('meta.pending_count', 1);
    }

    public function test_l_admin_de_l_agence_compte_les_avis_en_attente_de_son_agence(): void
    {
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agency);
        $this->review($this->agent, 5, ReviewStatus::Pending);
        $this->review($this->agent, 4, ReviewStatus::Pending);
        $this->review($this->agent, 3);

        $this->actingAsApi($admin);
        $this->getJson('/api/reviews/received')
            ->assertOk()
            ->assertJsonPath('meta.pending_count', 2)
            ->assertJsonPath('meta.distribution.3', 1)
            ->assertJsonPath('meta.distribution.5', 0);
    }
}
