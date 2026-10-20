<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Agency;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1049 (piste P61.02) — `GET /api/me/service-provider/collaborations` rendait la collaboration
 * brute (`$paginator->items()`), et son `include=agency` la ligne `agencies` entière : seuil des
 * reversements, `bank_csv_mapping`, `settings`, `metadata`. La ligne passe par sa ressource,
 * l'agence par `AgencyResource`, qui réserve le seuil à qui prépare ou approuve les reversements.
 */
class ServiceProviderCollaborationsListTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{0: User, 1: Agency}
     */
    private function prestataireDUneAgence(): array
    {
        $agence = Agency::factory()->create();
        $agence->forceFill([
            'payout_approval_threshold' => 750000,
            'bank_csv_mapping' => ['date' => 0, 'montant' => 1],
        ])->save();

        $prestataire = User::factory()->create();
        $profil = ServiceProviderProfile::factory()->create([
            'user_id' => $prestataire->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $profil->id,
            'agency_id' => $agence->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => '2026-09-19',
            'metadata' => ['paused_by' => 42],
        ]);

        return [$prestataire, $agence];
    }

    public function test_l_agence_incluse_ne_rend_ni_le_seuil_ni_le_mapping_bancaire(): void
    {
        [$prestataire, $agence] = $this->prestataireDUneAgence();

        Sanctum::actingAs($prestataire);
        $reponse = $this->getJson('/api/me/service-provider/collaborations?include=agency')->assertOk();

        $reponse->assertJsonPath('data.0.agency.id', $agence->id)
            ->assertJsonPath('data.0.agency.name', $agence->name);
        $agenceRendue = $reponse->json('data.0.agency');
        $this->assertArrayNotHasKey('payout_approval_threshold', $agenceRendue);
        $this->assertArrayNotHasKey('pending_payout_threshold', $agenceRendue);
        $this->assertArrayNotHasKey('bank_csv_mapping', $agenceRendue);
    }

    public function test_la_collaboration_sort_par_sa_ressource(): void
    {
        [$prestataire, $agence] = $this->prestataireDUneAgence();

        Sanctum::actingAs($prestataire);
        $ligne = $this->getJson('/api/me/service-provider/collaborations')->assertOk()->json('data.0');

        $this->assertSame($agence->id, $ligne['agency_id']);
        $this->assertSame('active', $ligne['status']);
        // La date calendaire, comme `/me/service-provider/agencies` (ADR-0018).
        $this->assertSame('2026-09-19', $ligne['started_at']);
        $this->assertArrayNotHasKey('metadata', $ligne);
        $this->assertArrayNotHasKey('deleted_at', $ligne);
    }
}
