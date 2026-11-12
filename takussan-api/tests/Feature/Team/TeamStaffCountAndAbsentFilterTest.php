<?php

namespace Tests\Feature\Team;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;

/**
 * TCK-2667 — les pastilles de la liste des collaborateurs (`/app/agency/team`) : « Tous » compte le
 * personnel (`meta.counts.staff`, un membre agent ET admin une seule fois — pas `agent + agency_admin`),
 * et « Absents » filtre la liste (`filter[absent]=1`) par le prédicat de son compte
 * (`meta.counts.absent`) : la pastille et la liste disent la même chose.
 */
class TeamStaffCountAndAbsentFilterTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-12 10:00:00'));
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        OwnerProfile::query()->where('user_id', $admin->id)->forceDelete();
    }

    private function member(string ...$profiles): User
    {
        $user = User::factory()->create();
        foreach ($profiles as $profile) {
            $class = match ($profile) {
                'agent' => AgentProfile::class,
                'agency_admin' => AgencyAdminProfile::class,
                'owner' => OwnerProfile::class,
            };
            $class::factory()->create(['user_id' => $user->id, 'agency_id' => $this->agency->id]);
        }

        return $user;
    }

    private function absence(User $absent, User $substitute, string $from, string $to): void
    {
        RoleDelegation::factory()->create([
            'user_id' => $substitute->id, 'delegator_id' => $absent->id, 'agency_id' => $this->agency->id,
            'role' => RoleDelegation::ABSENCE_ROLE, 'replaces_user_id' => $absent->id,
            'starts_at' => Carbon::parse($from), 'ends_at' => Carbon::parse($to),
            'status' => RoleDelegationStatus::Active, 'activated_at' => Carbon::parse($from),
        ]);
    }

    public function test_tous_compte_le_personnel_une_fois_par_personne(): void
    {
        $this->member('agent');
        $this->member('agent', 'agency_admin');
        $this->member('owner');
        $this->member('owner', 'agent');

        $response = $this->apiGet('/api/users?filter[role]=agent,agency_admin&per_page=50')->assertOk();

        // L'admin connecté, l'agent, l'agent-admin, le bailleur-agent : quatre personnes.
        $this->assertSame(4, $response->json('meta.total'));
        $this->assertSame(4, $response->json('meta.counts.staff'));
        $this->assertSame(3, $response->json('meta.counts.agent'));
        $this->assertSame(2, $response->json('meta.counts.agency_admin'));
    }

    public function test_tous_ne_bouge_pas_quand_une_autre_pastille_est_choisie(): void
    {
        $this->member('agent');
        $this->member('owner');

        $counts = $this->apiGet('/api/users?filter[role]=agency_admin')->assertOk()->json('meta.counts');

        $this->assertSame(2, $counts['staff']);
    }

    public function test_absents_filtre_la_liste_par_le_predicat_de_son_compte(): void
    {
        $absent = $this->member('agent');
        $remplacant = $this->member('agent');
        $this->member('agent');
        $ancien = $this->member('agent');
        $this->absence($absent, $remplacant, '2026-11-10 00:00', '2026-11-14 23:59');
        // Une absence terminée ne compte plus.
        $this->absence($ancien, $remplacant, '2026-11-01 00:00', '2026-11-05 23:59');

        $response = $this->apiGet('/api/users?filter[role]=agent,agency_admin&filter[absent]=1&fields[users]=id')->assertOk();

        $this->assertSame([$absent->id], collect($response->json('data'))->pluck('id')->all());
        $this->assertSame(1, $response->json('meta.counts.absent'));
        $this->assertSame($response->json('meta.total'), $response->json('meta.counts.absent'));
    }

    public function test_un_filtre_absent_faux_ne_restreint_rien(): void
    {
        $this->member('agent');

        $this->apiGet('/api/users?filter[role]=agent,agency_admin&filter[absent]=0')->assertOk()->assertJsonPath('meta.total', 2);
    }
}
