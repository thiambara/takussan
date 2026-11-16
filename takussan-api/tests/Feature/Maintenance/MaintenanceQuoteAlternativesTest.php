<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\Capability;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceQuoteAlternative;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2911 (ADR-0120 § 3) — la mise en concurrence : le personnel de l'agence du bien enregistre les
 * devis consultés et non retenus ; le bailleur les lit au détail ; aucun prestataire ne les lit
 * (clé absente), l'assigné compris ; ni le bailleur, ni le prestataire, ni une autre agence n'écrivent.
 */
class MaintenanceQuoteAlternativesTest extends ApiTestCase
{
    use CreatesAgencyMembers, MaintenanceActors, RefreshDatabase;

    public function test_ac2_l_agence_enregistre_deux_devis_et_le_bailleur_les_lit(): void
    {
        Storage::fake(config('media-library.disk_name'));
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::AwaitingOwner, [
            'quote_amount' => 480_000, 'quote_currency' => 'XOF', 'quote_submitted_at' => now(),
        ]);
        $concurrent = $this->providerFor($agency, userAttributes: ['first_name' => 'Ibrahima', 'last_name' => 'Sow']);

        Sanctum::actingAs($this->agentOf($agency));
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote-alternatives", ['provider_id' => $concurrent->id, 'amount' => 520000])
            ->assertCreated()
            ->assertJsonPath('data.quote_alternatives.0.amount', 520000)
            ->assertJsonPath('data.quote_alternatives.0.provider_name', 'Ibrahima Sow');
        $this->post("/api/maintenance-requests/{$mr->id}/quote-alternatives", [
            'provider_name' => 'Plomberie Thiès', 'amount' => '610000',
            'file' => UploadedFile::fake()->create('devis.pdf', 30, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();

        Sanctum::actingAs($landlord);
        $alternatives = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->json('data.quote_alternatives');
        $this->assertSame([520000.0, 610000.0], array_map(fn (array $a) => (float) $a['amount'], $alternatives));
        $this->assertSame('Plomberie Thiès', $alternatives[1]['provider_name']);
        $this->assertSame('devis.pdf', $alternatives[1]['file']['name']);
        $this->assertNotEmpty($alternatives[1]['file']['url']);
    }

    public function test_ac2_le_prestataire_assigne_ne_lit_pas_la_mise_en_concurrence(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'provider' => $provider, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted);
        $concurrent = $this->providerFor($agency);
        MaintenanceQuoteAlternative::query()->create(['maintenance_request_id' => $mr->id, 'provider_id' => $concurrent->id, 'amount' => 520000, 'currency' => 'XOF']);

        foreach (['prestataire assigné' => $provider, 'locataire demandeur' => $tenant] as $qui => $lecteur) {
            Sanctum::actingAs($lecteur);
            $data = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->json('data');
            $this->assertArrayNotHasKey('quote_alternatives', $data, $qui);
        }

        // Le prestataire non retenu ne lit pas la demande du tout.
        Sanctum::actingAs($concurrent);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertForbidden();
    }

    public function test_seul_le_personnel_de_l_agence_qui_gere_les_interventions_ecrit(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted);
        ['agency' => $autre] = $this->maintenanceScenario();
        $corps = ['provider_name' => 'Concurrent', 'amount' => 1000];

        foreach ([
            'bailleur' => $landlord,
            'prestataire assigné' => $provider,
            'autre agence' => $this->agentOf($autre),
            'agent sans maintenance.assign' => $this->agentWithout($agency, Capability::MaintenanceAssign),
        ] as $qui => $intrus) {
            Sanctum::actingAs($intrus);
            $this->postJson("/api/maintenance-requests/{$mr->id}/quote-alternatives", $corps)->assertForbidden();
        }
        $this->assertSame(0, MaintenanceQuoteAlternative::query()->count());
    }

    public function test_retrait_dans_la_demande_seulement_et_pas_sur_une_demande_close(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted);
        ['mr' => $ailleurs] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted);
        $mien = MaintenanceQuoteAlternative::query()->create(['maintenance_request_id' => $mr->id, 'provider_name' => 'A', 'amount' => 1, 'currency' => 'XOF']);
        $autre = MaintenanceQuoteAlternative::query()->create(['maintenance_request_id' => $ailleurs->id, 'provider_name' => 'B', 'amount' => 1, 'currency' => 'XOF']);

        Sanctum::actingAs($this->agentOf($agency));
        $this->deleteJson("/api/maintenance-requests/{$mr->id}/quote-alternatives/{$autre->id}")->assertNotFound();
        $this->assertNotNull($autre->fresh());
        $this->deleteJson("/api/maintenance-requests/{$mr->id}/quote-alternatives/{$mien->id}")->assertOk()
            ->assertJsonPath('data.quote_alternatives', []);

        $mr->forceFill(['status' => MaintenanceStatus::Closed])->save();
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote-alternatives", ['provider_name' => 'C', 'amount' => 1])
            ->assertStatus(422)->assertJsonPath('code', 'maintenance.terminal_request');
    }

    public function test_un_nom_ou_un_prestataire_est_exige_et_cinq_au_plus(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted);
        Sanctum::actingAs($this->agentOf($agency));

        $this->postJson("/api/maintenance-requests/{$mr->id}/quote-alternatives", ['amount' => 1000])
            ->assertUnprocessable()->assertJsonValidationErrors('provider_name');
        for ($i = 0; $i < MaintenanceQuoteAlternative::MAX_PER_REQUEST; $i++) {
            $this->postJson("/api/maintenance-requests/{$mr->id}/quote-alternatives", ['provider_name' => "P{$i}", 'amount' => 1000])->assertCreated();
        }
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote-alternatives", ['provider_name' => 'Trop', 'amount' => 1000])
            ->assertStatus(422)->assertJsonPath('code', 'maintenance.quote_alternatives_full');
    }
}
