<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * TCK-2909 (AC1, AC5) — les termes du mandat de gestion, écrits par `PATCH /api/owners/{id}` (la route
 * du plafond de travaux, même capacité) et rendus par la fiche : dates, moyen et jour de versement,
 * référent du personnel actif de l'agence. Le référent nourrit l'interlocuteur du bailleur, le jour
 * de versement sa page « Moyens de versement ».
 */
class OwnerMandateTermsTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private OwnerProfile $profile;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->profile = OwnerProfile::factory()->create(['agency_id' => $this->agency->id]);
    }

    private function agentOf(Agency $agency, array $user = []): User
    {
        $agent = User::factory()->create($user);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);

        return $agent->fresh();
    }

    /** AC1 — 200, la fiche rend les valeurs ; le plafond n'est pas touché ; le journal garde avant/après. */
    public function test_l_admin_regle_le_mandat_et_la_fiche_le_rend(): void
    {
        $awa = $this->agentOf($this->agency, ['first_name' => 'Awa', 'last_name' => 'Diop']);
        $this->profile->forceFill(['works_approval_threshold' => 150000])->save();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);

        $this->apiPatch("/api/owners/{$this->profile->id}", [
            'mandate_starts_on' => '2025-03-12',
            'mandate_ends_on' => '2028-03-11',
            'payout_method' => 'bank_transfer',
            'payout_day' => 10,
            'referent_agent_id' => $awa->id,
        ])->assertOk()
            ->assertJsonPath('data.mandate.starts_on', '2025-03-12')
            ->assertJsonPath('data.mandate.ends_on', '2028-03-11')
            ->assertJsonPath('data.mandate.payout_method', 'bank_transfer')
            ->assertJsonPath('data.mandate.payout_day', 10)
            ->assertJsonPath('data.mandate.referent.id', $awa->id)
            ->assertJsonPath('data.mandate.referent.first_name', 'Awa')
            ->assertJsonPath('data.mandate.referent.is_active', true)
            // Régler le mandat ne retire pas le plafond (la clé n'est pas envoyée).
            ->assertJsonPath('data.works_approval_threshold', 150000);

        $this->apiGet("/api/owners/{$this->profile->id}")->assertOk()
            ->assertJsonPath('data.mandate.starts_on', '2025-03-12')
            ->assertJsonPath('data.mandate.payout_day', 10);

        $activity = Activity::query()->where('event', 'owner_mandate_terms_updated')->sole();
        $this->assertSame($admin->id, $activity->causer_id);
        $this->assertEquals(['mandate_starts_on' => '2025-03-12', 'mandate_ends_on' => '2028-03-11', 'payout_method' => 'bank_transfer', 'payout_day' => 10, 'referent_agent_id' => $awa->id], $activity->properties['after']);

        // Une seule clé : seule elle change ; même valeur, rien au journal.
        $this->apiPatch("/api/owners/{$this->profile->id}", ['payout_day' => 5])->assertOk()
            ->assertJsonPath('data.mandate.payout_day', 5)
            ->assertJsonPath('data.mandate.payout_method', 'bank_transfer');
        $this->apiPatch("/api/owners/{$this->profile->id}", ['payout_day' => 5])->assertOk();
        $this->assertSame(2, Activity::query()->where('event', 'owner_mandate_terms_updated')->count());
        $this->assertSame(['payout_day' => 10], Activity::query()->where('event', 'owner_mandate_terms_updated')->latest('id')->first()->properties['before']);
    }

    /** AC1 — un référent d'une autre agence, un bailleur, un compte inconnu : 422 ; rien n'est écrit. */
    public function test_le_referent_est_du_personnel_actif_de_l_agence(): void
    {
        $ailleurs = $this->agentOf(Agency::factory()->create());
        $bailleur = User::factory()->withOwnerProfile($this->agency)->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);

        foreach ([$ailleurs->id, $bailleur->id, 999999] as $id) {
            $this->apiPatch("/api/owners/{$this->profile->id}", ['referent_agent_id' => $id])
                ->assertUnprocessable()->assertJsonValidationErrors('referent_agent_id');
        }
        $this->assertNull($this->profile->refresh()->referent_agent_id);
    }

    public function test_le_corps_est_valide(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $url = "/api/owners/{$this->profile->id}";

        $this->apiPatch($url, [])->assertUnprocessable();
        $this->apiPatch($url, ['payout_day' => 29])->assertUnprocessable()->assertJsonValidationErrors('payout_day');
        $this->apiPatch($url, ['payout_day' => 0])->assertUnprocessable();
        $this->apiPatch($url, ['payout_method' => 'troc'])->assertUnprocessable()->assertJsonValidationErrors('payout_method');
        $this->apiPatch($url, ['mandate_starts_on' => '2025-03-12', 'mandate_ends_on' => '2025-03-11'])
            ->assertUnprocessable()->assertJsonValidationErrors('mandate_ends_on');

        // Une seule borne envoyée se juge contre l'autre, en base.
        $this->apiPatch($url, ['mandate_starts_on' => '2025-03-12'])->assertOk();
        $this->apiPatch($url, ['mandate_ends_on' => '2025-01-01'])->assertUnprocessable()->assertJsonValidationErrors('mandate_ends_on');
        $this->apiPatch($url, ['mandate_ends_on' => '2028-03-11'])->assertOk();
        $this->apiPatch($url, ['mandate_starts_on' => '2029-01-01'])->assertUnprocessable()->assertJsonValidationErrors('mandate_starts_on');

        // `null` retire une valeur.
        $this->apiPatch($url, ['mandate_ends_on' => null])->assertOk()->assertJsonPath('data.mandate.ends_on', null);
    }

    /** Même capacité que le plafond : l'agent est refusé, une autre agence ne voit pas le profil. */
    public function test_l_agent_et_une_autre_agence_sont_refuses(): void
    {
        $this->apiActingAsRole('agent', ['agency' => $this->agency]);
        $this->apiPatch("/api/owners/{$this->profile->id}", ['payout_day' => 10])->assertForbidden();

        $this->apiActingAsRole('agency_admin', ['agency' => Agency::factory()->create()]);
        $this->apiPatch("/api/owners/{$this->profile->id}", ['payout_day' => 10])->assertNotFound();

        $this->assertNull($this->profile->refresh()->payout_day);
    }

    /** Le référent, membre actif, est l'interlocuteur du bailleur avant l'invitant ; parti, il ne l'est plus. */
    public function test_le_referent_est_l_interlocuteur_du_bailleur(): void
    {
        $landlord = User::factory()->create();
        $this->profile->forceFill(['user_id' => $landlord->id, 'status' => 'active'])->save();
        $awa = $this->agentOf($this->agency, ['first_name' => 'Awa', 'last_name' => 'Diop']);
        $this->profile->forceFill(['referent_agent_id' => $awa->id])->save();

        Sanctum::actingAs($landlord->fresh());
        $this->getJson("/api/me/owner-profiles/{$this->profile->id}/interlocuteur?fields[interlocuteur]=first_name,last_name,role")
            ->assertOk()
            ->assertJsonPath('data.source', 'referent')
            ->assertJsonPath('data.first_name', 'Awa')
            ->assertJsonPath('data.role', 'agent');

        AgentProfile::query()->where('user_id', $awa->id)->update(['status' => 'suspended']);
        $this->getJson("/api/me/owner-profiles/{$this->profile->id}/interlocuteur?fields[interlocuteur]=first_name,role")
            ->assertOk()
            ->assertJsonPath('data.source', 'agency');
    }

    /** Le jour de versement du profil bailleur ACTIF, servi avec ses moyens de versement. */
    public function test_le_bailleur_lit_son_jour_de_versement(): void
    {
        $landlord = User::factory()->create();
        $this->profile->forceFill(['user_id' => $landlord->id, 'status' => 'active', 'payout_day' => 5])->save();

        Sanctum::actingAs($landlord->fresh());
        $this->withHeader('X-Profile-Id', "owner:{$this->profile->id}")
            ->getJson('/api/me/payout-methods')->assertOk()->assertJsonPath('meta.payout_day', 5);

        $this->profile->forceFill(['payout_day' => null])->save();
        $this->withHeader('X-Profile-Id', "owner:{$this->profile->id}")
            ->getJson('/api/me/payout-methods')->assertOk()->assertJsonPath('meta.payout_day', null);
    }

    /** AC5 — le `down()` de la migration s'exécute sur PostgreSQL, et `up()` la rejoue. */
    public function test_la_migration_se_defait_et_se_rejoue(): void
    {
        $migration = require database_path('migrations/2026_11_15_290900_add_mandate_terms_to_owner_profiles_table.php');
        $this->profile->forceFill(['payout_day' => 10, 'mandate_starts_on' => '2025-03-12'])->save();

        $migration->down();
        $this->assertFalse(Schema::hasColumn('owner_profiles', 'payout_day'));
        $this->assertFalse(Schema::hasColumn('owner_profiles', 'referent_agent_id'));

        $migration->up();
        $this->assertTrue(Schema::hasColumn('owner_profiles', 'referent_agent_id'));
        $this->assertNull($this->profile->refresh()->payout_day);

        $payouts = require database_path('migrations/2026_11_15_290901_add_nature_to_payouts_table.php');
        $payouts->down();
        $this->assertFalse(Schema::hasColumn('payouts', 'nature'));
        $payouts->up();
        $this->assertTrue(Schema::hasColumn('payouts', 'nature'));
    }
}
