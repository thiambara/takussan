<?php

namespace Tests\Feature\Commission;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Enums\Capability;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2725 (décision du porteur du 2026-11-11, option a) — qui solde les commissions de l'équipe en
 * lit les lignes. Le grand livre s'ouvre à `payouts.approve` comme à `reports.view_agency`, sur ses
 * trois lectures : le relevé (`GET /api/commissions`), le point par bénéficiaire
 * (`GET /api/commissions/summary`) et l'export (`GET /api/export/commissions`). L'agent sans l'une ni
 * l'autre ne lit que ses lignes, partout. L'export reste gardé par `reports.export`.
 */
class CommissionLedgerVisibilityTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $b1;

    private User $b2;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->b1 = $this->agencyAgent($this->agency);
        $this->b2 = $this->agencyAgent($this->agency);
        $this->line($this->b1, 'LEASE-B1');
        $this->line($this->b2, 'LEASE-B2');
        $ailleurs = Agency::factory()->create();
        $this->line($this->agencyAgent($ailleurs), 'LEASE-AILLEURS', $ailleurs);
    }

    private function line(User $beneficiary, string $reference, ?Agency $agency = null): CommissionEntry
    {
        $agency ??= $this->agency;

        return CommissionEntry::factory()->create([
            'agency_id' => $agency->id,
            'lease_id' => Lease::factory()->create(['agency_id' => $agency->id, 'reference_number' => $reference])->id,
            'beneficiary_id' => $beneficiary->id,
            'status' => CommissionEntryStatus::Due,
            'paid_at' => null,
            'earned_at' => now()->subDays(5),
        ]);
    }

    /** @return list<int> les bénéficiaires du relevé */
    private function releve(User $as): array
    {
        $ids = array_column($this->actingAsApi($as)->getJson('/api/commissions?per_page=50')->assertOk()->json('data'), 'beneficiary_id');
        sort($ids);

        return array_values(array_unique($ids));
    }

    /** @return list<int> les bénéficiaires du point */
    private function point(User $as): array
    {
        $rows = $this->actingAsApi($as)->getJson('/api/commissions/summary')->assertOk()->json('data');
        $ids = array_column(array_column($rows, 'beneficiary'), 'id');
        sort($ids);

        return $ids;
    }

    private function export(User $as): string
    {
        return $this->actingAsApi($as)->getJson('/api/export/commissions?format=csv')->assertOk()->streamedContent();
    }

    private function deuxBeneficiaires(): array
    {
        $ids = [$this->b1->id, $this->b2->id];
        sort($ids);

        return $ids;
    }

    /** AC1 — R = {payouts.approve} sans reports.view_agency : relevé et point rendent B1 et B2 ; il solde B1. */
    public function test_ac1_qui_solde_lit_les_lignes_qu_il_solde(): void
    {
        $tresorier = $this->agentWith($this->agency, Capability::PayoutsApprove);
        $this->assertFalse($tresorier->canActAt(Capability::ReportsViewAgency, $this->agency), 'prémisse : sans reports.view_agency');

        $this->assertSame($this->deuxBeneficiaires(), $this->releve($tresorier));
        $this->assertSame($this->deuxBeneficiaires(), $this->point($tresorier));

        $ligneB1 = CommissionEntry::query()->where('beneficiary_id', $this->b1->id)->firstOrFail();
        $this->actingWithStepUp($tresorier);
        $this->postJson('/api/commissions/settle', [
            'beneficiary_id' => $this->b1->id,
            'entry_ids' => [$ligneB1->id],
            'paid_at' => now()->toDateString(),
            'payment_method' => 'wave',
            'payment_reference' => 'WAVE-2725',
        ])->assertOk();
        $this->assertSame(CommissionEntryStatus::Paid, $ligneB1->fresh()->status);
    }

    /** AC2 — R qui tient aussi reports.export : l'export rend les lignes de B1 et de B2, jamais d'ailleurs. */
    public function test_ac2_qui_solde_et_exporte_exporte_toute_l_agence(): void
    {
        $tresorier = $this->agentWith($this->agency, Capability::PayoutsApprove, Capability::ReportsExport);
        $this->assertFalse($tresorier->canActAt(Capability::ReportsViewAgency, $this->agency), 'prémisse : sans reports.view_agency');

        $corps = $this->export($tresorier);

        $this->assertStringContainsString('LEASE-B1', $corps);
        $this->assertStringContainsString('LEASE-B2', $corps);
        $this->assertStringNotContainsString('LEASE-AILLEURS', $corps);
    }

    /** Sans reports.export, payouts.approve n'ouvre pas l'export : ses lignes seules (own_lines_only, TCK-2661). */
    public function test_payouts_approve_n_ouvre_pas_l_export_des_autres(): void
    {
        $tresorier = $this->agentWith($this->agency, Capability::PayoutsApprove);
        $this->assertFalse($tresorier->canActAt(Capability::ReportsExport, $this->agency), 'prémisse : sans reports.export');
        $this->line($tresorier, 'LEASE-TRESORIER');

        $corps = $this->export($tresorier);

        $this->assertStringContainsString('LEASE-TRESORIER', $corps);
        $this->assertStringNotContainsString('LEASE-B1', $corps);
        $this->assertStringNotContainsString('LEASE-B2', $corps);
    }

    /** AC3 — l'agent sans payouts.approve ni reports.view_agency : relevé, point et export rendent ses lignes seules. */
    public function test_ac3_l_agent_ne_lit_que_ses_lignes_partout(): void
    {
        $this->assertFalse($this->b1->canActAt(Capability::PayoutsApprove, $this->agency), 'prémisse : sans payouts.approve');
        $this->assertFalse($this->b1->canActAt(Capability::ReportsViewAgency, $this->agency), 'prémisse : sans reports.view_agency');

        $this->assertSame([$this->b1->id], $this->releve($this->b1));
        $this->assertSame([$this->b1->id], $this->point($this->b1));
        $corps = $this->export($this->b1);
        $this->assertStringContainsString('LEASE-B1', $corps);
        $this->assertStringNotContainsString('LEASE-B2', $corps);
    }

    /** AC4 — l'admin qui tient reports.view_agency : inchangé, toutes les lignes, sur les trois lectures. */
    public function test_ac4_l_admin_lit_toute_l_agence(): void
    {
        $admin = $this->agencyAdmin($this->agency);

        $this->assertSame($this->deuxBeneficiaires(), $this->releve($admin));
        $this->assertSame($this->deuxBeneficiaires(), $this->point($admin));
        $corps = $this->export($admin);
        $this->assertStringContainsString('LEASE-B1', $corps);
        $this->assertStringContainsString('LEASE-B2', $corps);
        $this->assertStringNotContainsString('LEASE-AILLEURS', $corps);
    }

    /** `CommissionEntryPolicy::view` dit ce que dit le périmètre, pour les trois rôles. */
    public function test_la_policy_suit_le_perimetre(): void
    {
        $ligneB2 = CommissionEntry::query()->where('beneficiary_id', $this->b2->id)->firstOrFail();
        // [lecteur, lit la ligne de B2] — chacun jugé sous SON profil actif, celui de la requête.
        $lecteurs = [
            'qui solde' => [$this->agentWith($this->agency, Capability::PayoutsApprove), true],
            'admin' => [$this->agencyAdmin($this->agency), true],
            'agent' => [$this->b1, false],
        ];

        foreach ($lecteurs as $qui => [$lecteur, $attendu]) {
            // Hors requête HTTP, le profil actif n'est pas résolu par le middleware : on le pose.
            request()->attributes->set('active_profile', AgentProfile::query()->where('user_id', $lecteur->id)->first()
                ?? AgencyAdminProfile::query()->where('user_id', $lecteur->id)->firstOrFail());
            $parLePerimetre = CommissionEntry::query()->visibleTo($lecteur)->whereKey($ligneB2->id)->exists();
            $this->assertSame($attendu, $parLePerimetre, "{$qui} : périmètre");
            $this->assertSame($attendu, $lecteur->can('view', $ligneB2), "{$qui} : policy");
        }
        request()->attributes->remove('active_profile');
    }

    /**
     * Contrat TCK-146 — l'ouverture vaut sous le profil ACTIF de l'agence de la ligne : qui solde dans
     * A, et tient aussi `payouts.approve` comme admin d'une agence X, ne lit pas une ligne de X tant
     * que son profil actif est celui de A.
     */
    public function test_payouts_approve_ailleurs_n_ouvre_pas_la_ligne_hors_du_profil_actif(): void
    {
        $tresorier = $this->agentWith($this->agency, Capability::PayoutsApprove);
        $x = Agency::factory()->create();
        $this->materializeRoleProfile($tresorier, 'agency_admin', $x);
        $this->assertTrue($tresorier->canActAt(Capability::PayoutsApprove, $x), 'prémisse : il solde aussi dans X');
        $ligneX = $this->line($this->agencyAgent($x), 'LEASE-X', $x);

        request()->attributes->set('active_profile', AgentProfile::query()->where('user_id', $tresorier->id)->where('agency_id', $this->agency->id)->firstOrFail());
        $this->assertFalse($tresorier->can('view', $ligneX));
        request()->attributes->remove('active_profile');
    }

    /**
     * Le jugement des deux capacités se fait une fois par requête : le relevé de qui solde coûte le
     * même nombre de requêtes pour 2 lignes de l'équipe et pour 10 — et il les rend bien toutes.
     */
    public function test_le_perimetre_se_juge_une_fois_par_requete(): void
    {
        $tresorier = $this->agentWith($this->agency, Capability::PayoutsApprove);
        $mesurer = function () use ($tresorier): array {
            $this->actingAsApi($tresorier);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $lignes = count($this->getJson('/api/commissions?per_page=50')->assertOk()->json('data'));
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return [$lignes, $n];
        };

        $mesurer(); // échauffement : le premier appel remplit le cache des rôles (une requête de plus)
        [$deux, $coutDeDeux] = $mesurer();
        foreach (range(1, 8) as $_) {
            $this->line($this->b2, 'LEASE-B2-'.uniqid());
        }
        [$dix, $coutDeDix] = $mesurer();

        $this->assertSame([2, 10], [$deux, $dix], 'qui solde lit les lignes de l\'équipe');
        $this->assertSame($coutDeDeux, $coutDeDix, "2 lignes : {$coutDeDeux} requêtes, 10 : {$coutDeDix}");
    }
}
