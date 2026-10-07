<?php

namespace Tests\Feature\Auth\Session;

use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-589 AC15 — verrou par compte (contrainte 5 bis, ADR-0033 §6) : 10 mots de passe
 * faux, puis le BON → 423 `account_locked`. Le geste « Déverrouiller » de la console,
 * qui rendait toujours 409 (`metadata.locked_at` n'était écrit par personne), agit.
 *
 * Rouge sur `5f872f1f` (200, puis 409). Ablation rejouée : ne lire le verrou que sur la
 * branche d'échec → `test_dix_echecs_puis_le_bon_mot_de_passe_rend_423` rougit.
 */
class PasswordLoginLockTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        // Le limiteur d'IP `throttle:5,10` couperait la série avant le seuil du compte.
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->user = User::factory()->create(['email' => 'cible@example.com', 'password' => 'bon-mot-de-passe']);
    }

    private function echouer(int $fois): void
    {
        for ($i = 0; $i < $fois; $i++) {
            $this->postJson('/api/auth/login', ['email' => 'cible@example.com', 'password' => 'mauvais'])
                ->assertUnauthorized();
        }
    }

    private function connecter(): TestResponse
    {
        return $this->postJson('/api/auth/login', ['email' => 'cible@example.com', 'password' => 'bon-mot-de-passe']);
    }

    public function test_dix_echecs_puis_le_bon_mot_de_passe_rend_423(): void
    {
        $this->echouer(10);

        $this->connecter()->assertStatus(423)->assertJsonPath('code', 'account_locked')->assertJsonMissingPath('token');
        $this->assertNotNull($this->user->fresh()->metadata['locked_at'] ?? null);
        $this->assertSame(10, $this->user->fresh()->metadata['failed_login_attempts']);
    }

    public function test_neuf_echecs_ne_verrouillent_pas(): void
    {
        $this->echouer(9);

        $this->connecter()->assertOk();
    }

    public function test_le_deverrouillage_du_support_agit_enfin(): void
    {
        $this->echouer(10);
        $this->connecter()->assertStatus(423);

        $admin = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => 'JBSWY3DPEHPK3PXP']);
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $admin->id]);
        // Vérification adverse B1 : lever un verrou rouvre un compte, step-up exigé.
        $this->actingAsWithStepUp($admin);

        $this->postJson("/api/admin/users/{$this->user->id}/unlock", ['reason' => 'Identité vérifiée par téléphone'])
            ->assertOk();

        $this->app['auth']->forgetGuards();
        $this->connecter()->assertOk()->assertJsonStructure(['token', 'expires_at']);
    }

    public function test_le_verrou_tombe_seul_au_bout_de_quinze_minutes(): void
    {
        $this->echouer(10);

        $this->travel(14)->minutes();
        $this->travel(58)->seconds();
        $this->connecter()->assertStatus(423);

        // 15 min 01 après la pose du verrou.
        $this->travel(3)->seconds();
        $this->connecter()->assertOk();
        $this->assertArrayNotHasKey('locked_at', $this->user->fresh()->metadata ?? []);
    }

    public function test_un_succes_avant_le_seuil_remet_le_compteur_a_zero(): void
    {
        $this->echouer(9);
        $this->connecter()->assertOk();
        $this->assertArrayNotHasKey('failed_login_attempts', $this->user->fresh()->metadata ?? []);

        // Neuf nouveaux échecs : toujours sous le seuil, puisque la série est repartie de zéro.
        $this->echouer(9);
        $this->connecter()->assertOk();
    }

    public function test_un_tiers_ne_peut_pas_verrouiller_indefiniment(): void
    {
        $this->echouer(10);
        $this->travel(16)->minutes();

        // Le verrou échu ne compte plus : un échec isolé ne le reprend pas.
        $this->echouer(1);
        $this->connecter()->assertOk();
    }
}
