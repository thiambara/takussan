<?php

namespace Tests\Feature\Account;

use App\Models\AccountDeletionRequest;
use App\Models\Agency;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use App\Services\Agency\AgentHandoverService;
use App\Services\Agency\AgentPortfolio;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2170 (P204.04, décision du porteur du 2026-10-24) — les demandes de contact (`form`, non
 * traitées) adressées à un membre sont une catégorie `contact_leads` de la passation : comptées,
 * passées au repreneur. À l'effacement, leur destinataire est recalculé par
 * `PrimaryPropertyContact::for()`, et laissé tel quel pour une demande sans bien ni agence.
 */
class DemandesDeContactDuPartantTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private Property $bien;

    private User $agent;

    private User $collegue;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->bien = $this->bienDe($this->agence);
        $this->admin = $this->personnel($this->agence, 'agency_admin');
        $this->agent = $this->personnel($this->agence);
        $this->collegue = $this->personnel($this->agence);
    }

    private function demande(?Property $bien, ?int $agencyId, array $attributs = []): PropertyContactLead
    {
        return PropertyContactLead::factory()->create($attributs + [
            'property_id' => $bien?->id,
            'agency_id' => $agencyId,
            'recipient_user_id' => $this->agent->id,
        ]);
    }

    public function test_la_passation_compte_et_transmet_les_demandes_non_traitees(): void
    {
        $ouverte = $this->demande($this->bien, $this->agence->id);
        $traitee = $this->demande($this->bien, $this->agence->id, ['handled_at' => now(), 'handled_by_id' => $this->agent->id]);

        $this->assertSame(1, app(AgentPortfolio::class)->inventory($this->agence, $this->agent)['contact_leads'] ?? null);

        app(AgentHandoverService::class)->transfer($this->agence, $this->agent, ['contact_leads' => $this->collegue], $this->admin);

        $this->assertSame($this->collegue->id, $ouverte->fresh()->recipient_user_id);
        $this->assertSame($this->agent->id, $traitee->fresh()->recipient_user_id);
    }

    public function test_a_l_effacement_le_destinataire_est_recalcule_par_le_contact_du_bien(): void
    {
        $this->collaborateur($this->bien, $this->agent, '2026-01-10 09:00:00');
        $this->collaborateur($this->bien, $this->collegue, '2026-01-11 09:00:00');
        $demande = $this->demande($this->bien, $this->agence->id);

        $request = AccountDeletionRequest::factory()->for($this->agent)->due()->create();
        app(AccountDeletionService::class)->executeDeletion($request);

        $this->assertSame($this->collegue->id, $demande->fresh()->recipient_user_id);
    }

    public function test_une_demande_sans_bien_ni_agence_reste_telle_quelle(): void
    {
        $demande = $this->demande(null, null);

        $request = AccountDeletionRequest::factory()->for($this->agent)->due()->create();
        app(AccountDeletionService::class)->executeDeletion($request);

        $this->assertSame($this->agent->id, $demande->fresh()->recipient_user_id);
    }

    public function test_une_demande_d_agence_sans_bien_retombe_sans_destinataire(): void
    {
        $demande = $this->demande(null, $this->agence->id);

        $request = AccountDeletionRequest::factory()->for($this->agent)->due()->create();
        app(AccountDeletionService::class)->executeDeletion($request);

        $this->assertNull($demande->fresh()->recipient_user_id);
    }
}
