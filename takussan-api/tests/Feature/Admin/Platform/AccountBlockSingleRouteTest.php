<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\UserStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-600 (verif-600 m1, m2) — bloquer et réactiver un compte n'ont plus qu'un chemin : la console.
 *
 * `POST /api/users/{u}/block|activate` en étaient un second, ouvert au `super_admin` : sans motif,
 * sans activité, sans avis, sans la garde « opérateur » (un `super_admin` se bloquait par là avec
 * son profil plateforme toujours actif) et sans fermer l'impersonation ouverte sur la cible.
 * Retirées, pour tous les acteurs ; la console, elle, porte tout cela (`AdminUserLifecycleTest`).
 */
class AccountBlockSingleRouteTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use OperateursPlateforme;
    use RefreshDatabase;

    public function test_les_routes_hors_console_n_existent_plus(): void
    {
        $this->assertFalse(Route::has('users.block'));
        $this->assertFalse(Route::has('users.activate'));
    }

    public function test_aucun_acteur_ne_bloque_ni_ne_reactive_hors_console(): void
    {
        $actif = User::factory()->create(['status' => UserStatus::Active]);
        $bloque = User::factory()->create(['status' => UserStatus::Blocked]);
        $agence = Agency::factory()->create();

        $acteurs = [
            'super_admin' => fn () => $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin),
            'agency_admin' => fn () => $this->actingAsWithStepUp($this->personnel($agence, 'agency_admin')),
        ];

        foreach ($acteurs as $nom => $agir) {
            $agir();
            $this->assertContains($this->postJson("/api/users/{$actif->id}/block")->status(), [404, 405], $nom);
            $this->assertContains($this->postJson("/api/users/{$bloque->id}/activate")->status(), [404, 405], $nom);
            $this->app['auth']->forgetGuards();
        }

        $this->assertSame(UserStatus::Active, $actif->fresh()->status);
        $this->assertSame(UserStatus::Blocked, $bloque->fresh()->status);
    }

    /** Le seul chemin restant : un `super_admin` ne s'y bloque pas, ni un autre opérateur. */
    public function test_la_console_refuse_de_bloquer_un_operateur(): void
    {
        $pair = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->postJson("/api/admin/users/{$pair->id}/block", ['reason' => 'Départ de l\'équipe support.'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'platform.revoke_operator_first');
        $this->assertSame(UserStatus::Active, $pair->fresh()->status);
    }
}
