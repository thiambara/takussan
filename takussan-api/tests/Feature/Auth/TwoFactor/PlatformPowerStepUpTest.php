<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Models\Agency;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse B1 — `PUT /api/users/{u}/role {"role":"super_admin"}` et
 * `POST /api/users/{u}/activate` (retirée par TCK-600 : la console) vivent hors de `/api/admin/*` : un super-admin SANS 2FA, puis
 * un jeton super-admin SANS step-up (volé), y fabriquaient un super-admin et rouvraient un
 * compte bloqué. Rouge sur `e59cb8b2` (200 aux quatre appels).
 */
class PlatformPowerStepUpTest extends TestCase
{
    use RefreshDatabase;

    private User $cible;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cible = User::factory()->create(['status' => UserStatus::Blocked]);
    }

    public function test_un_super_admin_sans_2fa_ne_promeut_ni_ne_debloque(): void
    {
        $this->actingAsRole('super_admin', ['two_factor_enabled' => false, 'two_factor_secret' => null]);

        $this->promouvoir()->assertForbidden()->assertJsonPath('code', 'two_factor_required');
        $this->debloquer()->assertForbidden()->assertJsonPath('code', 'two_factor_required');
        $this->assertFalse(PlatformProfile::query()->where('user_id', $this->cible->id)->exists());
        $this->assertSame(UserStatus::Blocked, $this->cible->fresh()->status);
    }

    public function test_un_jeton_super_admin_sans_step_up_ne_promeut_ni_ne_debloque(): void
    {
        $admin = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($admin, 'super_admin');
        $this->actingAs($admin->withAccessToken($this->jetonSansStepUp($admin)), 'sanctum');

        $this->promouvoir()->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
        $this->debloquer()->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
        $this->postJson("/api/admin/users/{$this->cible->id}/unlock", ['reason' => 'Appel reçu'])
            ->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
        $this->assertFalse(PlatformProfile::query()->where('user_id', $this->cible->id)->exists());
    }

    /**
     * `Gate::before` ouvre au super-admin toutes les policies d'agence : une action de
     * `AGENCY_TWO_FACTOR` sur une agence dont il n'est pas membre ne lui demandait rien.
     */
    public function test_un_super_admin_sans_2fa_ne_modifie_pas_une_agence(): void
    {
        $agence = Agency::factory()->create(['name' => 'Avant']);
        $this->actingAsRole('super_admin', ['two_factor_enabled' => false, 'two_factor_secret' => null]);

        $this->putJson("/api/agencies/{$agence->id}", ['name' => 'Après'])
            ->assertForbidden()->assertJsonPath('code', 'two_factor_required');
        $this->assertSame('Avant', $agence->fresh()->name);
    }

    /**
     * TCK-600 (ADR-0047 §4) — même avec step-up, la route de rôle ne promeut plus : la cooptation
     * est le seul chemin d'octroi (`SuperAdminGrantOnlyByCooptationTest`).
     */
    public function test_avec_step_up_le_super_admin_debloque_mais_ne_promeut_plus(): void
    {
        $this->actingAsRole('super_admin');

        $this->promouvoir()->assertStatus(422);
        $this->debloquer()->assertOk();
        $this->assertFalse(PlatformProfile::query()->where('user_id', $this->cible->id)->exists());
    }

    public function test_l_admin_d_agence_attribue_un_role_dans_son_agence_sans_step_up(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $this->materializeRoleProfile($this->cible, 'agent', $admin->agencyAdminProfiles()->first()->agency);

        $this->assertNotSame(
            'two_factor_step_up_required',
            $this->putJson("/api/users/{$this->cible->id}/role", ['role' => 'agent'])->json('code'),
        );
    }

    private function promouvoir()
    {
        return $this->putJson("/api/users/{$this->cible->id}/role", ['role' => 'super_admin']);
    }

    private function debloquer()
    {
        // TCK-600 (verif-600 m1) — `POST /api/users/{u}/activate` est retirée : débloquer passe par
        // la console, sous la même garde (2FA, puis step-up).
        return $this->postJson("/api/admin/users/{$this->cible->id}/reactivate", ['reason' => 'Identité vérifiée par appel.']);
    }

    private function jetonSansStepUp(User $user): PersonalAccessToken
    {
        return $user->createToken('vole')->accessToken;
    }
}
