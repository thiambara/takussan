<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\User;
use App\Services\Membership\SystemRoleCapabilities;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2260 (P116.07, décision du porteur) — le rapprochement bancaire ne jugeait que « admin de
 * l'agence » (`BankStatementPolicy::viewAny`, lu par les quatre gestes : liste, détail, import,
 * clôture — et par les lignes, le mapping CSV et la recherche de paiements). Il passe par la
 * capacité neuve `payments.reconcile`, que seul le rôle système d'admin porte par défaut : l'admin
 * dont le rôle la retire n'y entre plus, l'admin principal ne s'en enferme pas dehors.
 */
class RapprochementBancaireExigePaymentsReconcileTest extends TestCase
{
    use CreatesAgencyMembers, RefreshDatabase;

    private Agency $agency;

    private BankStatement $statement;

    private BankStatementLine $line;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->statement = BankStatement::factory()->readyForReview()->create(['agency_id' => $this->agency->id]);
        $this->line = BankStatementLine::factory()->create(['bank_statement_id' => $this->statement->id]);
    }

    /** @return array<string, int> le statut de chaque geste du rapprochement */
    private function gestes(User $user): array
    {
        Sanctum::actingAs($user);
        $a = $this->agency->id;
        $s = $this->statement->id;

        return [
            'relevés (liste)' => $this->getJson("/api/agencies/{$a}/bank-statements")->status(),
            'relevé (import)' => $this->postJson("/api/agencies/{$a}/bank-statements", [])->status(),
            'relevé (détail)' => $this->getJson("/api/bank-statements/{$s}")->status(),
            'relevé (lignes)' => $this->getJson("/api/bank-statements/{$s}/lines")->status(),
            'mapping CSV' => $this->getJson("/api/agencies/{$a}/bank-statements/csv-mapping")->status(),
            'recherche de paiements' => $this->getJson("/api/agencies/{$a}/bank-statements/payment-search")->status(),
            'ligne (ignorer)' => $this->postJson("/api/bank-statement-lines/{$this->line->id}/ignore")->status(),
            'relevé (clôture)' => $this->postJson("/api/bank-statements/{$s}/finalize")->status(),
        ];
    }

    public function test_l_admin_sans_payments_reconcile_ne_rapproche_rien(): void
    {
        $gestes = $this->gestes($this->adminWithout($this->agency, Capability::PaymentsReconcile));

        $this->assertSame(array_fill_keys(array_keys($gestes), 403), $gestes);
        $this->assertNull($this->statement->fresh()->finalized_at);
    }

    /** La capacité est réservée par défaut à l'admin : le rôle système d'agent ne la porte pas. */
    public function test_l_agent_du_role_systeme_ne_porte_pas_payments_reconcile(): void
    {
        $this->assertNotContains(
            Capability::PaymentsReconcile,
            app(SystemRoleCapabilities::class)->for(AgencyRoleBaseType::Agent),
        );
        $this->assertContains(
            Capability::PaymentsReconcile,
            app(SystemRoleCapabilities::class)->for(AgencyRoleBaseType::AgencyAdmin),
        );

        $gestes = $this->gestes($this->agencyAgent($this->agency));

        $this->assertSame(array_fill_keys(array_keys($gestes), 403), $gestes);
    }

    /** Aucun agent ne gagne ces gestes, même s'il tient `payments.reconcile` (même forme que TCK-2024). */
    public function test_l_agent_qui_tient_payments_reconcile_ne_rapproche_rien(): void
    {
        $gestes = $this->gestes($this->agentWith($this->agency, Capability::PaymentsReconcile));

        $this->assertSame(array_fill_keys(array_keys($gestes), 403), $gestes);
    }

    /** Témoin : l'admin du rôle système rapproche (l'import vide est refusé en 422, pas en 403). */
    public function test_l_admin_du_role_systeme_rapproche(): void
    {
        $gestes = $this->gestes($this->agencyAdmin($this->agency));

        foreach ($gestes as $geste => $statut) {
            $this->assertNotSame(403, $statut, "{$geste} → {$statut}");
        }
        $this->assertSame(422, $gestes['relevé (import)']);
        $this->assertSame(200, $gestes['relevés (liste)']);
    }

    /** L'admin principal ne s'enferme pas dehors, même si son rôle retire la capacité. */
    public function test_l_admin_principal_sans_payments_reconcile_rapproche_encore(): void
    {
        $admin = $this->adminWithout($this->agency, Capability::PaymentsReconcile);
        $this->agency->forceFill(['primary_admin_id' => $admin->id])->save();

        Sanctum::actingAs($admin);
        $this->getJson("/api/agencies/{$this->agency->id}/bank-statements")->assertOk();
        $this->getJson("/api/bank-statements/{$this->statement->id}")->assertOk();
    }
}
