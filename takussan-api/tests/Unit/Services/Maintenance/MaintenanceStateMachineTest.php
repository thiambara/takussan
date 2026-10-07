<?php

namespace Tests\Unit\Services\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Services\Maintenance\MaintenanceStateMachine;
use PHPUnit\Framework\TestCase;

/**
 * TCK-592 — la table unique et la matrice (acteur, cible), sans base ni HTTP.
 */
class MaintenanceStateMachineTest extends TestCase
{
    private MaintenanceStateMachine $machine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->machine = new MaintenanceStateMachine;
    }

    public function test_every_status_has_a_row_and_every_target_is_a_status(): void
    {
        foreach (MaintenanceStatus::cases() as $status) {
            $this->assertArrayHasKey($status->value, MaintenanceStateMachine::TRANSITIONS, $status->value);
        }

        foreach (MaintenanceStateMachine::TRANSITIONS as $from => $targets) {
            foreach ($targets as $to) {
                $this->assertNotNull(MaintenanceStatus::tryFrom($to), "{$from} → {$to}");
            }
        }
    }

    /** Les états de devis s'annulent : l'ancienne table générique n'avait aucune clé pour eux. */
    public function test_quote_states_can_be_cancelled(): void
    {
        foreach (['quote_requested', 'quote_submitted', 'awaiting_owner', 'rejected', 'approved'] as $from) {
            $this->assertTrue(
                $this->machine->canTransition(MaintenanceStatus::from($from), MaintenanceStatus::Cancelled),
                $from,
            );
        }
    }

    public function test_terminal_states_have_no_exit(): void
    {
        $this->assertSame([], MaintenanceStateMachine::TRANSITIONS['closed']);
        $this->assertSame([], MaintenanceStateMachine::TRANSITIONS['cancelled']);
        $this->assertTrue($this->machine->isTerminal(MaintenanceStatus::Closed));
        $this->assertFalse($this->machine->isTerminal(MaintenanceStatus::Completed));
    }

    /** Le prestataire : démarrer, terminer — jamais annuler, jamais clore, jamais relancer `completed`. */
    public function test_provider_matrix(): void
    {
        $provider = MaintenanceStateMachine::ACTOR_PROVIDER;

        $this->assertTrue($this->machine->actorAllows($provider, MaintenanceStatus::Approved, MaintenanceStatus::InProgress));
        $this->assertTrue($this->machine->actorAllows($provider, MaintenanceStatus::InProgress, MaintenanceStatus::Completed));

        foreach (MaintenanceStatus::cases() as $from) {
            $this->assertFalse($this->machine->actorAllows($provider, $from, MaintenanceStatus::Cancelled));
            $this->assertFalse($this->machine->actorAllows($provider, $from, MaintenanceStatus::Closed));
            $this->assertFalse($this->machine->actorAllows($provider, $from, MaintenanceStatus::Approved));
        }

        $this->assertFalse($this->machine->actorAllows($provider, MaintenanceStatus::Completed, MaintenanceStatus::InProgress));
    }

    /** Le donneur d'ordre : tout, sauf soumettre un devis. */
    public function test_principal_matrix(): void
    {
        $principal = MaintenanceStateMachine::ACTOR_PRINCIPAL;

        foreach (MaintenanceStatus::cases() as $to) {
            $this->assertSame(
                $to !== MaintenanceStatus::QuoteSubmitted,
                $this->machine->actorAllows($principal, MaintenanceStatus::Open, $to),
                $to->value,
            );
        }
    }

    /** Le demandeur : confirmer ou contester une intervention terminée, rien d'autre. */
    public function test_requester_matrix(): void
    {
        $requester = MaintenanceStateMachine::ACTOR_REQUESTER;

        $this->assertTrue($this->machine->actorAllows($requester, MaintenanceStatus::Completed, MaintenanceStatus::Closed));
        $this->assertTrue($this->machine->actorAllows($requester, MaintenanceStatus::Completed, MaintenanceStatus::InProgress));
        $this->assertFalse($this->machine->actorAllows($requester, MaintenanceStatus::Open, MaintenanceStatus::Cancelled));
        $this->assertFalse($this->machine->actorAllows($requester, MaintenanceStatus::InProgress, MaintenanceStatus::Completed));
    }

    /** Une contestation n'est pas un retour en arrière générique : elle porte un commentaire. */
    public function test_contest_is_not_generic(): void
    {
        $this->assertFalse($this->machine->isGeneric(MaintenanceStatus::Completed, MaintenanceStatus::InProgress));
        $this->assertTrue($this->machine->isGeneric(MaintenanceStatus::Approved, MaintenanceStatus::InProgress));
        $this->assertFalse($this->machine->isGeneric(MaintenanceStatus::QuoteSubmitted, MaintenanceStatus::Approved));
    }
}
