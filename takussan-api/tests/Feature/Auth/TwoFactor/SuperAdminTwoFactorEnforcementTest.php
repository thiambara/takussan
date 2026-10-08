<?php

namespace Tests\Feature\Auth\TwoFactor;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-589 AC7 — la console plateforme exige la 2FA (ADR-0033, contrainte 7).
 *
 * Rouge sur `5f872f1f` : `EnsureSuperAdmin` ne vérifiait que le profil, un
 * super-admin sans second facteur lisait et modifiait toute la plateforme.
 * Deux verrous indépendants — `RequireTwoFactor` (toute `/api/admin/*`) et le bloc
 * d'`EnsureSuperAdmin` — : l'ablation qui rougit retire les deux.
 */
class SuperAdminTwoFactorEnforcementTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_super_admin_sans_2fa_recoit_403_two_factor_required(): void
    {
        $this->actingAsRole('super_admin', ['two_factor_enabled' => false]);

        $this->getJson('/api/admin/users')
            ->assertForbidden()
            ->assertJsonPath('code', 'two_factor_required');
    }

    public function test_un_super_admin_avec_2fa_passe(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/users')->assertOk();
    }

    public function test_un_non_super_admin_reste_refuse_par_le_profil_et_non_par_la_2fa(): void
    {
        $this->actingAsRole('customer');

        $response = $this->getJson('/api/admin/users')->assertForbidden();
        $this->assertNotSame('two_factor_required', $response->json('code'));
    }

    public function test_les_routes_d_enrolement_restent_ouvertes_au_super_admin_sans_2fa(): void
    {
        $this->actingAsRole('super_admin', ['two_factor_enabled' => false]);

        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('two_factor_enabled', false);
        $this->postJson('/api/auth/two-factor/enable')->assertOk()->assertJsonStructure(['data' => ['secret', 'qr_svg']]);
    }
}
