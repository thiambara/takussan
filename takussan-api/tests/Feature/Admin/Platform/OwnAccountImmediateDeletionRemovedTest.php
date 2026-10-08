<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-600 — AC8 : l'effacement IMMÉDIAT n'existe plus.
 *
 * `DELETE /api/auth/account` effaçait son propre compte sans step-up, sans délai de grâce, sans
 * contrôle d'obligations ; `DELETE /api/users/{user}` faisait de même pour un super-admin, par une
 * copie locale d'`anonymize()` qui gardait `username` et le secret 2FA. L'effacement passe par
 * `AccountDeletionService`, et par lui seul.
 */
class OwnAccountImmediateDeletionRemovedTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    public function test_son_propre_compte_ne_s_efface_plus_sur_le_champ(): void
    {
        $compte = User::factory()->create();
        $this->actingAs($compte);

        $this->assertContains($this->deleteJson('/api/auth/account')->status(), [404, 405]);
        $this->assertNotSoftDeleted('users', ['id' => $compte->id]);
    }

    public function test_un_super_admin_n_efface_plus_un_compte_sur_le_champ(): void
    {
        $compte = User::factory()->create();
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->assertContains($this->deleteJson("/api/users/{$compte->id}")->status(), [404, 405]);
        $this->assertNotSoftDeleted('users', ['id' => $compte->id]);
    }

    public function test_aucune_route_ne_porte_plus_les_noms_retires(): void
    {
        $this->assertFalse(Route::has('users.destroy'));
        $this->assertFalse(Route::has('auth.account.destroy'));
    }
}
