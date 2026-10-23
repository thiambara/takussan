<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-1772 (P62.07) — le calendrier, l'intégration, l'invitation et l'affectation d'un rôle ne
 * disent plus quelles agences, quels profils ni quels rôles existent. `exists:agencies,id` et
 * `exists:agency_roles,id` rendaient 422 pour un identifiant absent quand la ligne d'une agence
 * tierce passait la validation et recevait le refus ; le profil tiers rendait 403, l'absent 404.
 *
 * Décision du porteur (2026-10-20) : même traitement que P62.01, et 404 quand `assign` refuse.
 * Le super-admin, seul à pouvoir nommer une autre agence, garde son 422 (AgenceSupprimeeNonCibleeTest).
 */
class AgencyAndRoleExistenceOracleTest extends ApiTestCase
{
    use RefreshDatabase;

    private const ABSENT = 99999999;

    private Agency $tierce;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tierce = Agency::factory()->create();
    }

    /** @return array{0: int, 1: mixed} */
    private function verdict(TestResponse $response): array
    {
        return [$response->status(), $response->json()];
    }

    private function calendrier(int $agencyId): TestResponse
    {
        return $this->getJson('/api/calendar?start_date='.now()->toDateString()
            .'&end_date='.now()->addWeek()->toDateString()."&agency_id={$agencyId}");
    }

    public function test_le_calendrier_rend_le_refus_pour_une_agence_absente(): void
    {
        $this->actingAsApi(User::factory()->create());

        $tierce = $this->verdict($this->calendrier($this->tierce->id));
        $this->assertSame(403, $tierce[0]);
        $this->assertSame('calendar.other_agency_forbidden', $tierce[1]['code'] ?? null);
        $this->assertSame($tierce, $this->verdict($this->calendrier(self::ABSENT)));
    }

    public function test_le_super_admin_garde_le_422_d_une_agence_absente_au_calendrier(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->calendrier(self::ABSENT)->assertStatus(422)->assertJsonValidationErrors(['agency_id']);
        $this->calendrier($this->tierce->id)->assertOk();
    }

    public function test_l_integration_rend_la_meme_reponse_pour_une_agence_absente(): void
    {
        $this->actingAsApi(User::factory()->create());

        $envoyer = fn (int $agencyId) => $this->verdict($this->postJson('/api/integrations', [
            'provider' => 'inconnu',
            'agency_id' => $agencyId,
        ]));

        $tierce = $envoyer($this->tierce->id);
        $this->assertSame(422, $tierce[0]);
        $this->assertArrayNotHasKey('agency_id', $tierce[1]['errors']);
        $this->assertSame($tierce, $envoyer(self::ABSENT));
    }

    public function test_l_invitation_rend_la_meme_reponse_pour_une_agence_absente(): void
    {
        $this->actingAsApi(User::factory()->create());

        $envoyer = fn (int $agencyId) => $this->verdict($this->postJson('/api/invitations', [
            'email' => 'pas-une-adresse',
            'agency_id' => $agencyId,
        ]));

        $tierce = $envoyer($this->tierce->id);
        $this->assertSame(422, $tierce[0]);
        $this->assertArrayNotHasKey('agency_id', $tierce[1]['errors']);
        $this->assertSame($tierce, $envoyer(self::ABSENT));
    }

    public function test_l_admin_d_une_autre_agence_ne_distingue_pas_l_agence_absente_de_l_invitation(): void
    {
        $admin = User::factory()->withTwoFactor()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => Agency::factory()->create()->id]);
        $this->actingAsApi($admin);

        $envoyer = fn (int $agencyId) => $this->verdict($this->postJson('/api/invitations', [
            'email' => 'invite@example.test',
            'role' => 'agent',
            'invitable_type' => AgentProfile::class,
            'invitable_id' => 1,
            'agency_id' => $agencyId,
        ]));

        $tierce = $envoyer($this->tierce->id);
        $this->assertSame(403, $tierce[0]);
        $this->assertSame($tierce, $envoyer(self::ABSENT));
    }

    private function affecter(int $profileId, int $roleId): TestResponse
    {
        return $this->patchJson("/api/profiles/{$profileId}/agency-role", [
            'profile_type' => AgencyRoleBaseType::Agent->value,
            'agency_role_id' => $roleId,
        ]);
    }

    public function test_l_affectation_rend_404_pour_un_profil_tiers_comme_pour_un_absent(): void
    {
        $this->actingAsApi(User::factory()->create());

        $profilTiers = AgentProfile::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $this->tierce->id,
        ]);
        $roleTiers = AgencyRole::factory()->ofType(AgencyRoleBaseType::Agent)->create(['agency_id' => $this->tierce->id]);

        $tiers = $this->verdict($this->affecter($profilTiers->id, $roleTiers->id));
        $this->assertSame(404, $tiers[0]);
        $this->assertSame($tiers, $this->verdict($this->affecter(self::ABSENT, $roleTiers->id)));
        $this->assertSame($tiers, $this->verdict($this->affecter($profilTiers->id, self::ABSENT)));
        $this->assertSame($tiers, $this->verdict($this->affecter(self::ABSENT, self::ABSENT)));
    }

    public function test_l_admin_recoit_la_meme_reponse_pour_un_role_absent_et_un_role_tiers(): void
    {
        $agence = Agency::factory()->create();
        $admin = User::factory()->withTwoFactor()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agence->id]);
        $profil = AgentProfile::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $agence->id,
        ]);
        $roleTiers = AgencyRole::factory()->ofType(AgencyRoleBaseType::Agent)->create(['agency_id' => $this->tierce->id]);
        $this->actingAsApi($admin);

        $tiers = $this->verdict($this->affecter($profil->id, $roleTiers->id));
        $this->assertSame(422, $tiers[0]);
        $this->assertArrayHasKey('agency_role_id', $tiers[1]['errors']);
        $this->assertSame($tiers, $this->verdict($this->affecter($profil->id, self::ABSENT)));
    }
}
