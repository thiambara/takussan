<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2260 (P116.07, décision du porteur) — le journal d'audit de l'agence (liste, historique d'un
 * objet, export) et le tableau de bord du bailleur ouvert à l'admin ne jugeaient que « admin de
 * l'agence ». Ils exigent désormais aussi `reports.view_agency`, comme les autres chiffres de
 * l'agence : l'admin dont le rôle la retire n'y entre plus, l'agent qui la tient n'y gagne rien.
 * Le bailleur garde son propre tableau de bord sans capacité.
 */
class JournalEtTableauDuBailleurExigentReportsViewAgencyTest extends TestCase
{
    use CreatesAgencyMembers, RefreshDatabase;

    private Agency $agency;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->property = Property::factory()->create(['agency_id' => $this->agency->id]);
    }

    /** @return array<string, int> le statut de chaque lecture */
    private function lectures(User $user): array
    {
        Sanctum::actingAs($user);

        return [
            'journal (liste)' => $this->getJson('/api/activity-log')->getStatusCode(),
            'journal (liste, ancienne route)' => $this->getJson('/api/audit-log')->getStatusCode(),
            'journal (par objet)' => $this->getJson("/api/activity-log/property/{$this->property->id}")->getStatusCode(),
            'journal (export)' => $this->getJson('/api/activity-logs/export?format=csv')->getStatusCode(),
            'tableau de bord du bailleur' => $this->getJson('/api/dashboard/owner')->getStatusCode(),
        ];
    }

    public function test_l_admin_sans_reports_view_agency_ne_lit_ni_le_journal_ni_le_tableau_du_bailleur(): void
    {
        $lectures = $this->lectures($this->adminWithout($this->agency, Capability::ReportsViewAgency));

        $this->assertSame(array_fill_keys(array_keys($lectures), 403), $lectures);
    }

    /** Aucun agent ne gagne ces lectures, même s'il tient `reports.view_agency`. */
    public function test_l_agent_qui_tient_reports_view_agency_ne_lit_rien(): void
    {
        $lectures = $this->lectures($this->agentWith($this->agency, Capability::ReportsViewAgency));

        $this->assertSame(array_fill_keys(array_keys($lectures), 403), $lectures);
    }

    /** Témoin : l'admin du rôle système lit tout. */
    public function test_l_admin_du_role_systeme_lit_le_journal_et_le_tableau_du_bailleur(): void
    {
        $lectures = $this->lectures($this->agencyAdmin($this->agency));

        foreach ($lectures as $lecture => $statut) {
            $this->assertSame(200, $statut, "{$lecture} → {$statut}");
        }
    }

    /** Le bailleur lit son tableau de bord sans capacité d'agence, et toujours pas le journal. */
    public function test_le_bailleur_garde_son_tableau_de_bord(): void
    {
        $owner = User::factory()->create(['agency_id' => $this->agency->id]);
        Sanctum::actingAs($owner);

        $this->getJson('/api/dashboard/owner')->assertOk();
        $this->getJson('/api/activity-log')->assertForbidden();
    }
}
