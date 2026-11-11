<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2723 (décision du porteur du 2026-11-11, option a) — qui une alerte de seuil prévient : le
 * NOMBRE à tous ses lecteurs (le personnel de l'agence), les NOMS au seul lecteur qui peut modifier
 * l'alerte (`AgencyIndicatorPolicy::update`, la règle de l'écriture). Pour les autres, la clé reste
 * et la liste est vide : `recipients = {count, users: []}`.
 */
class ThresholdAlertRecipientsVisibilityTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $awa;

    private User $moussa;

    private ThresholdAlert $alert;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->awa = $this->agencyAdmin($this->agency);
        $this->awa->update(['first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $this->moussa = $this->agencyAdmin($this->agency);
        $this->moussa->update(['first_name' => 'Moussa', 'last_name' => 'Sow']);
        $this->alert = $this->alerte();
    }

    private function alerte(): ThresholdAlert
    {
        return ThresholdAlert::create([
            'agency_id' => $this->agency->id,
            'metric' => 'maintenance_open',
            'operator' => '>',
            'threshold' => 10.0,
            'severity' => 'critical',
            'is_enabled' => true,
            'cooldown_hours' => 24,
        ]);
    }

    /**
     * La liste et la fiche, lues par `$reader`.
     *
     * @return array{0: array<string, mixed>, 1: array<string, mixed>}
     */
    private function lus(User $reader): array
    {
        $this->actingAsApi($reader);
        $index = collect($this->getJson('/api/threshold-alerts')->assertOk()->json('data'))->firstWhere('id', $this->alert->id);
        $show = $this->getJson("/api/threshold-alerts/{$this->alert->id}")->assertOk()->json('data');

        return [$index['recipients'], $show['recipients']];
    }

    /** AC1 */
    public function test_l_agent_lit_le_nombre_l_admin_lit_les_noms(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $this->actingAsApi($agent)->patchJson("/api/threshold-alerts/{$this->alert->id}", ['severity' => 'critical'])->assertForbidden();

        foreach ($this->lus($agent) as $recipients) {
            $this->assertSame(['count' => 2, 'users' => []], $recipients);
        }

        foreach ($this->lus($this->awa) as $recipients) {
            $this->assertSame(2, $recipients['count']);
            $this->assertEqualsCanonicalizing(['Awa Ndiaye', 'Moussa Sow'], array_column($recipients['users'], 'name'));
        }
    }

    /** AC2 — le jugement est `update` sur l'alerte, pas le profil. */
    public function test_le_jugement_est_la_regle_de_l_ecriture(): void
    {
        // Prémisse par la route (le profil actif n'existe que dans une requête) : la sévérité est
        // déjà `critical`, la modification ne change rien.
        $agentQuiGere = $this->agentWith($this->agency, Capability::AgencyUpdate);
        $this->actingAsApi($agentQuiGere)->patchJson("/api/threshold-alerts/{$this->alert->id}", ['severity' => 'critical'])->assertOk();
        foreach ($this->lus($agentQuiGere) as $recipients) {
            $this->assertEqualsCanonicalizing([$this->awa->id, $this->moussa->id], array_column($recipients['users'], 'id'));
        }

        $adminQuiNeGerePas = $this->adminWithout($this->agency, Capability::AgencyUpdate);
        $this->actingAsApi($adminQuiNeGerePas)->patchJson("/api/threshold-alerts/{$this->alert->id}", ['severity' => 'critical'])->assertForbidden();
        foreach ($this->lus($adminQuiNeGerePas) as $recipients) {
            // `count` ne dépend pas du lecteur : un admin de plus, prévenu, dans les deux lectures.
            $this->assertSame(['count' => 3, 'users' => []], $recipients);
        }
        foreach ($this->lus($this->awa) as $recipients) {
            $this->assertSame(3, $recipients['count']);
            $this->assertCount(3, $recipients['users']);
        }
    }

    /** Les réponses d'écriture passent par la même lecture : l'admin qui écrit lit les noms. */
    public function test_la_reponse_de_l_ecriture_porte_les_noms(): void
    {
        $this->actingAsApi($this->awa);
        $patch = $this->patchJson("/api/threshold-alerts/{$this->alert->id}", ['severity' => 'warning'])->assertOk();

        $this->assertEqualsCanonicalizing(['Awa Ndiaye', 'Moussa Sow'], array_column($patch->json('data.recipients.users'), 'name'));
    }

    /**
     * AC3 — le jugement ne coûte pas une requête par ligne : de une à vingt alertes, ni l'agent ni
     * l'admin ne paient une requête de plus.
     *
     * TCK-2739 (AC3) — la lecture amorce le résolveur ({@see MembershipCapabilityResolver::primed()})
     * pour le lecteur et les admins de l'agence : l'écart agent − admin passe de 5 requêtes à UNE
     * (mesuré : 31 contre 30 ; 43 contre 38 avant). Il est nommé, et il ne vient pas de la lecture :
     *
     * - +2 pour l'agent : les collaborations de prestataire et les délégations de l'amorce, sortes
     *   paresseuses qu'un jugement REFUSÉ seul parcourt (l'agent ne lit pas les rapports) ; l'admin,
     *   accordé par son rôle, n'y descend jamais ;
     * - +1 pour l'admin : `staffAgencyId()` → `isStaffAt()`, hors amorce, qui borne la liste à l'agence
     *   du lecteur (`ThresholdAlertController::index`, tracé par pile d'appels) — il essaie le profil
     *   d'agent avant celui d'admin, et l'agent s'arrête au premier.
     */
    public function test_le_jugement_ne_coute_pas_une_requete_par_ligne(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $compter = function (User $reader): int {
            $this->actingAsApi($reader)->getJson('/api/threshold-alerts?per_page=50')->assertOk();
            $this->app['auth']->forgetGuards();
            $this->actingAsApi($reader);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/threshold-alerts?per_page=50')->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $agentUne = $compter($agent);
        $adminUne = $compter($this->awa);
        foreach (range(2, 20) as $_) {
            $this->alerte();
        }
        $agentVingt = $compter($agent);
        $adminVingt = $compter($this->awa);

        $this->assertSame($agentUne, $agentVingt, "agent : 1 alerte {$agentUne}, 20 alertes {$agentVingt}");
        $this->assertSame($adminUne, $adminVingt, "admin : 1 alerte {$adminUne}, 20 alertes {$adminVingt}");
        $this->assertSame($agentUne - $adminUne, $agentVingt - $adminVingt, 'l\'écart agent − admin ne dépend pas de la page');
        $this->assertSame(1, $agentVingt - $adminVingt, "agent {$agentVingt}, admin {$adminVingt} : l'écart nommé ci-dessus");
    }
}
