<?php

namespace Tests\Feature\Admin\Platform;

use App\Domain\Notifications\NotificationCode;
use App\Models\AccountDeletionRequest;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\UserStatus;
use App\Models\Lease;
use App\Models\User;
use App\Notifications\AccountDeletionRequestedNotification;
use App\Notifications\CodedNotification;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\EnvoisParCode;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-600 — AC6 et AC7 : bloquer, réactiver et effacer un compte depuis la console.
 */
class AdminUserLifecycleTest extends TestCase
{
    use EnvoisParCode;
    use OperateursPlateforme;
    use RefreshDatabase;

    private const MOTIF = 'Fraude signalée par trois agences, dossier 2026-114.';

    /** AC6. */
    public function test_un_compte_bloque_par_la_console_ne_s_authentifie_plus_puis_revient_apres_reactivation(): void
    {
        Notification::fake();
        $compte = User::factory()->create(['email' => 'fatou@example.com']);
        $avant = $compte->createToken('mobile')->plainTextToken;
        $operateur = $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->postJson("/api/admin/users/{$compte->id}/block", ['reason' => self::MOTIF])
            ->assertOk()
            ->assertJsonPath('data.status', 'blocked');

        $activite = Activity::query()->where('event', 'super_admin_user_blocked')->sole();
        $this->assertSame($operateur->id, (int) $activite->causer_id);
        $this->assertSame(self::MOTIF, $activite->properties['reason']);
        Notification::assertSentTo($compte, CodedNotification::class, self::deCode(NotificationCode::AccountBlocked));

        $apres = $compte->fresh()->createToken('nouveau')->plainTextToken;
        foreach ([$avant, $apres] as $jeton) {
            $this->app['auth']->forgetGuards();
            $this->withToken($jeton)->getJson('/api/auth/me')->assertUnauthorized();
        }

        $this->app['auth']->forgetGuards();
        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->postJson("/api/admin/users/{$compte->id}/reactivate", ['reason' => 'Levée après enquête.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'active');
        Notification::assertSentTo($compte, CodedNotification::class, self::deCode(NotificationCode::AccountReactivated));

        $this->app['auth']->forgetGuards();
        $jeton = $this->postJson('/api/auth/login', ['email' => 'fatou@example.com', 'password' => 'password'])
            ->assertOk()
            ->json('token');
        $this->app['auth']->forgetGuards();
        $this->withToken($jeton)->getJson('/api/auth/me')->assertOk();
    }

    public function test_le_motif_est_requis_et_un_viewer_ne_bloque_pas(): void
    {
        $compte = User::factory()->create();
        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->postJson("/api/admin/users/{$compte->id}/block")->assertStatus(422);

        $this->agirEnOperateur(PlatformProfileLevel::Viewer);
        $this->postJson("/api/admin/users/{$compte->id}/block", ['reason' => self::MOTIF])->assertForbidden();

        $this->assertSame(UserStatus::Active, $compte->fresh()->status);
    }

    /** Bloquer un opérateur contournerait la garde du retrait (dernier `super_admin`). */
    public function test_on_ne_bloque_ni_soi_ni_un_operateur_et_on_ne_reactive_qu_un_compte_bloque(): void
    {
        $pair = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $acteur = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->postJson("/api/admin/users/{$acteur->id}/block", ['reason' => self::MOTIF])
            ->assertStatus(422)->assertJsonPath('code', 'user.cannot_block_self');
        $this->postJson("/api/admin/users/{$pair->id}/block", ['reason' => self::MOTIF])
            ->assertStatus(422)->assertJsonPath('code', 'platform.revoke_operator_first');
        $this->assertSame(UserStatus::Active, $pair->fresh()->status);

        $this->postJson('/api/admin/users/'.User::factory()->create()->id.'/reactivate', ['reason' => 'Rien.'])
            ->assertStatus(422)->assertJsonPath('code', 'user.not_blocked');
    }

    /** AC7 — un bailleur d'un bail actif : 422 qui liste le bail, rien n'est planifié. */
    public function test_effacer_un_bailleur_sous_bail_actif_est_refuse_avec_le_bail(): void
    {
        $bail = Lease::factory()->create(['status' => LeaseStatus::Active]);
        $bailleur = User::query()->findOrFail($bail->landlord_id);
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $reponse = $this->postJson("/api/admin/users/{$bailleur->id}/erase", ['reason' => self::MOTIF])
            ->assertStatus(422)
            ->assertJsonPath('code', 'account_deletion.has_obligations');

        $this->assertContains($bail->id, collect($reponse->json('obligations'))->where('type', 'lease')->pluck('id')->all());
        $this->assertSame(0, AccountDeletionRequest::query()->count());
    }

    /** AC7 — sans obligation : demande planifiée au délai de grâce, causée par l'opérateur, puis exécutée. */
    public function test_effacer_planifie_au_delai_de_grace_puis_l_execution_efface(): void
    {
        Notification::fake();
        $compte = User::factory()->create(['username' => 'moussa-sarr', 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $compte->createToken('mobile');
        $operateur = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->postJson("/api/admin/users/{$compte->id}/erase", ['reason' => self::MOTIF])
            ->assertStatus(202)
            ->assertJsonPath('data.user_id', $compte->id);

        $demande = AccountDeletionRequest::query()->where('user_id', $compte->id)->sole();
        $grace = app(AccountDeletionService::class)->graceDays();
        $this->assertSame($grace, (int) round($demande->requested_at->diffInDays($demande->scheduled_for)));
        $this->assertSame(self::MOTIF, $demande->reason);
        $this->assertSame(0, $compte->tokens()->count());

        $demandee = Activity::query()->where('event', 'account.deletion.requested')->sole();
        $this->assertSame($operateur->id, (int) $demandee->causer_id);
        $this->assertSame('operator', $demandee->properties['step_up']);
        $this->assertSame(self::MOTIF, Activity::query()->where('event', 'super_admin_user_erasure_requested')->sole()->properties['reason']);
        Notification::assertSentTo($compte, AccountDeletionRequestedNotification::class);

        app(AccountDeletionService::class)->executeDeletion($demande->fresh());

        $efface = User::withTrashed()->findOrFail($compte->id);
        $this->assertSame(UserStatus::Deleted, $efface->status);
        $this->assertNull($efface->username);
        $this->assertNull($efface->two_factor_secret);
    }

    public function test_seul_le_super_admin_efface_et_jamais_un_operateur(): void
    {
        $compte = User::factory()->create();
        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->postJson("/api/admin/users/{$compte->id}/erase", ['reason' => self::MOTIF])->assertForbidden();

        $support = $this->operateur(PlatformProfileLevel::Support);
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->postJson("/api/admin/users/{$support->id}/erase", ['reason' => self::MOTIF])
            ->assertStatus(422)->assertJsonPath('code', 'platform.revoke_operator_first');

        $this->assertSame(0, AccountDeletionRequest::query()->count());
    }
}
