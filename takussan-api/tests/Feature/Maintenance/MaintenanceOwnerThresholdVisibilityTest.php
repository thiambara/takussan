<?php

namespace Tests\Feature\Maintenance;

use App\Models\Agency;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Profiles\OwnerProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2654 (décision 1a) — `owner_approval_threshold`, le plafond de travaux du bailleur (ADR-0037),
 * sur la fiche d'une demande : l'écran du devis le rappelle au bailleur (« au-delà de {seuil}, votre
 * accord est demandé »). Servi au seul donneur d'ordre — le bailleur du bien et le personnel de son
 * agence — et ABSENT pour tout autre lecteur : le locataire, le prestataire, un autre bailleur de la
 * même agence, le personnel d'une autre agence. Jamais sur une liste.
 */
class MaintenanceOwnerThresholdVisibilityTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_le_bailleur_du_bien_lit_son_plafond(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->scenario(150000);

        Sanctum::actingAs($landlord);
        $this->getJson("/api/maintenance-requests/{$mr->id}")
            ->assertOk()
            ->assertJsonPath('data.owner_approval_threshold', 150000);
    }

    public function test_le_personnel_de_l_agence_lit_le_plafond(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->scenario(150000);

        Sanctum::actingAs($this->agentOf($agency));
        $this->getJson("/api/maintenance-requests/{$mr->id}")
            ->assertOk()
            ->assertJsonPath('data.owner_approval_threshold', 150000);
    }

    public function test_sans_plafond_la_cle_est_nulle_pour_le_bailleur(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->scenario(null);

        Sanctum::actingAs($landlord);
        $response = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk();
        $this->assertArrayHasKey('owner_approval_threshold', $response->json('data'));
        $this->assertNull($response->json('data.owner_approval_threshold'));
    }

    public function test_le_locataire_demandeur_ne_le_lit_pas(): void
    {
        ['mr' => $mr, 'tenant' => $tenant] = $this->scenario(150000);

        Sanctum::actingAs($tenant);
        $data = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->json('data');
        $this->assertArrayNotHasKey('owner_approval_threshold', $data);
    }

    public function test_le_prestataire_assigne_ne_le_lit_pas(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->scenario(150000);

        Sanctum::actingAs($provider);
        $data = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->json('data');
        $this->assertArrayNotHasKey('owner_approval_threshold', $data);
        // Le prestataire lit le devis (le sien), pas le plafond du bailleur.
        $this->assertArrayHasKey('quote_amount', $data);
    }

    public function test_un_autre_bailleur_de_l_agence_ne_le_lit_pas(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->scenario(150000);

        Sanctum::actingAs($this->landlordOf($agency));
        $this->assertNoThreshold($this->getJson("/api/maintenance-requests/{$mr->id}"));
    }

    public function test_le_personnel_d_une_autre_agence_ne_le_lit_pas(): void
    {
        ['mr' => $mr] = $this->scenario(150000);

        Sanctum::actingAs($this->agentOf(Agency::factory()->create()));
        $this->assertNoThreshold($this->getJson("/api/maintenance-requests/{$mr->id}"));
    }

    public function test_jamais_sur_une_liste(): void
    {
        ['landlord' => $landlord, 'agency' => $agency] = $this->scenario(150000);

        foreach ([$landlord, $this->agentOf($agency)] as $lecteur) {
            Sanctum::actingAs($lecteur);
            $lignes = $this->getJson('/api/maintenance-requests')->assertOk()->json('data');
            $this->assertNotEmpty($lignes);
            foreach ($lignes as $ligne) {
                $this->assertArrayNotHasKey('owner_approval_threshold', $ligne);
            }
        }
    }

    /** Refusé, ou servi sans la clé : jamais le plafond. */
    private function assertNoThreshold(TestResponse $response): void
    {
        if ($response->status() === 200) {
            $this->assertArrayNotHasKey('owner_approval_threshold', $response->json('data'));

            return;
        }
        $this->assertContains($response->status(), [403, 404]);
    }

    /** @return array<string, mixed> */
    private function scenario(?int $threshold): array
    {
        $scenario = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, [
            'quote_amount' => 485000, 'quote_currency' => 'XOF', 'quote_submitted_at' => now(),
        ]);
        OwnerProfile::query()
            ->where('user_id', $scenario['landlord']->id)
            ->where('agency_id', $scenario['agency']->id)
            ->update(['works_approval_threshold' => $threshold]);

        return $scenario;
    }
}
