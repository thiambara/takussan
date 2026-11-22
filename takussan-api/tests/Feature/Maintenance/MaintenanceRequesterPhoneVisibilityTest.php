<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2917 (ADR-0118 § 2) — « Appeler » / « WhatsApp » le demandeur : `requester.phone` au seul
 * personnel de l'agence du bien (lecteur du bail à ce titre, règle de TCK-2637), au détail. Clé
 * ABSENTE pour le bailleur, le prestataire (assigné ou non) et une autre agence.
 */
class MaintenanceRequesterPhoneVisibilityTest extends ApiTestCase
{
    use MaintenanceActors, RefreshDatabase;

    private const NUMERO = '+221775384106';

    public function test_ac2_l_agent_de_l_agence_du_bien_lit_le_telephone_du_demandeur(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->scenario();

        Sanctum::actingAs($this->agentOf($agency));
        $this->getJson("/api/maintenance-requests/{$mr->id}?include=requester")
            ->assertOk()
            ->assertJsonPath('data.requester.phone', self::NUMERO);
    }

    public function test_ac2_ni_le_bailleur_ni_le_prestataire_assigne_ne_lisent_requester_phone(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'provider' => $provider] = $this->scenario();

        foreach (['bailleur' => $landlord, 'prestataire' => $provider] as $qui => $lecteur) {
            Sanctum::actingAs($lecteur);
            $requester = $this->getJson("/api/maintenance-requests/{$mr->id}?include=requester")->assertOk()->json('data.requester');
            $this->assertIsArray($requester, $qui);
            $this->assertArrayNotHasKey('phone', $requester, $qui);
        }

        // Après acceptation, le prestataire lit le numéro dans son kit d'accès (TCK-592, P6), jamais
        // dans le résumé du demandeur.
        $mr->forceFill(['accepted_at' => now()])->save();
        Sanctum::actingAs($provider);
        $data = $this->getJson("/api/maintenance-requests/{$mr->id}?include=requester")->assertOk()->json('data');
        $this->assertArrayNotHasKey('phone', $data['requester']);
        $this->assertSame(self::NUMERO, $data['access']['requester_phone'] ?? null);
    }

    public function test_ac2_un_prestataire_non_assigne_et_une_autre_agence_ne_lisent_rien(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->scenario();
        ['agency' => $autre] = $this->maintenanceScenario();

        foreach ([$this->providerFor($agency), $this->agentOf($autre)] as $lecteur) {
            Sanctum::actingAs($lecteur);
            $this->getJson("/api/maintenance-requests/{$mr->id}?include=requester")->assertForbidden();
        }
    }

    /** Sur une liste, jamais : le téléphone n'est servi qu'au détail. */
    public function test_la_liste_ne_rend_pas_le_telephone(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->scenario();

        Sanctum::actingAs($this->agentOf($agency));
        $ligne = collect($this->getJson('/api/maintenance-requests?include=requester')->assertOk()->json('data'))
            ->firstWhere('id', $mr->id);
        $this->assertIsArray($ligne['requester'] ?? null);
        $this->assertArrayNotHasKey('phone', $ligne['requester']);
    }

    /** @return array<string, mixed> */
    private function scenario(): array
    {
        $scenario = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        $scenario['tenant']->forceFill(['phone' => self::NUMERO])->save();

        return $scenario;
    }
}
