<?php

namespace Tests\Feature\Auth\Session;

use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\User;
use App\Services\Auth\TwoFactorService;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

/**
 * P245.02 (TCK-2367) — le compteur d'échecs de connexion et `force_2fa_reconfigure` vivent dans
 * `users.metadata`, et leurs écrivains recomposaient la colonne depuis le compte CHARGÉ avant de la
 * réécrire en entier. Mesuré (db3e25230) : un échec écrit pendant le `POST /api/auth/login` au
 * mauvais mot de passe → compteur à 1 au lieu de 2 ; la réinitialisation de la console écrite au
 * même moment → drapeau effacé, 2FA coupée.
 *
 * Décision du porteur : ils s'écrivent par un `UPDATE … jsonb_set` atomique, jamais depuis le
 * modèle chargé. Le geste concurrent est joué une fois, dans l'écouteur `retrieved` du compte visé,
 * après sa lecture et avant l'écriture ; ou, quand la requête ne relit pas le compte (jeton de
 * Sanctum), sur un modèle chargé avant lui.
 */
class EchecsDeConnexionCroisesTest extends TestCase
{
    use RefreshDatabase;

    private User $cible;

    protected function setUp(): void
    {
        parent::setUp();
        // Le limiteur d'IP n'est pas l'objet : comme `PasswordLoginLockTest`.
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->cible = User::factory()->create(['email' => 'cible@example.com', 'password' => 'bon-mot-de-passe']);
    }

    public function test_deux_echecs_croises_comptent_deux(): void
    {
        $this->pendantLaLecture(fn () => $this->metadataEnBase([
            'failed_login_attempts' => 1,
            'failed_login_first_at' => now()->toIso8601String(),
        ]));

        $this->echouer();

        $this->assertSame(2, $this->cible->fresh()->metadata['failed_login_attempts']);
    }

    public function test_un_echec_croise_avec_la_reinitialisation_de_la_2fa_laisse_le_drapeau(): void
    {
        $this->cible->forceFill(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET])->save();

        $this->pendantLaLecture(function (): void {
            DB::table('users')->where('id', $this->cible->id)->update([
                'two_factor_enabled' => false,
                'two_factor_secret' => null,
                'metadata' => json_encode(['force_2fa_reconfigure' => true]),
            ]);
        });

        $this->echouer();

        $metadata = $this->cible->fresh()->metadata;
        $this->assertTrue($metadata['force_2fa_reconfigure'] ?? null);
        $this->assertSame(1, $metadata['failed_login_attempts']);
    }

    public function test_la_reinitialisation_croisee_avec_un_echec_garde_le_compteur(): void
    {
        $this->cible->forceFill(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET])->save();
        $this->actingAsRole('super_admin');

        $this->pendantLaLecture(fn () => $this->metadataEnBase([
            'failed_login_attempts' => 3,
            'failed_login_first_at' => now()->toIso8601String(),
        ]));

        $this->postJson("/api/admin/users/{$this->cible->id}/reset-2fa", ['reason' => 'Téléphone perdu'])->assertOk();

        $fresh = $this->cible->fresh();
        $this->assertFalse($fresh->two_factor_enabled);
        $this->assertTrue($fresh->metadata['force_2fa_reconfigure'] ?? null);
        $this->assertSame(3, $fresh->metadata['failed_login_attempts'] ?? null);
    }

    public function test_le_deverrouillage_croise_avec_la_reinitialisation_garde_le_drapeau(): void
    {
        $verrou = [
            'failed_login_attempts' => 10,
            'failed_login_first_at' => now()->toIso8601String(),
            'locked_at' => now()->toIso8601String(),
        ];
        $this->metadataEnBase($verrou);
        $this->actingAsRole('super_admin');

        $this->pendantLaLecture(fn () => $this->metadataEnBase($verrou + ['force_2fa_reconfigure' => true]));

        $this->postJson("/api/admin/users/{$this->cible->id}/unlock", ['reason' => 'Identité vérifiée'])->assertOk();

        $this->assertSame(['force_2fa_reconfigure' => true], $this->cible->fresh()->metadata);
    }

    public function test_l_enrolement_qui_solde_la_reinitialisation_garde_un_echec_croise(): void
    {
        $secret = app(TwoFactorService::class)->generateSecret();
        $this->cible->forceFill([
            'two_factor_enabled' => false,
            'two_factor_secret' => $secret,
            'metadata' => ['force_2fa_reconfigure' => true],
        ])->save();
        $charge = $this->cible->fresh();
        $this->metadataEnBase(['force_2fa_reconfigure' => true, 'failed_login_attempts' => 4, 'failed_login_first_at' => now()->toIso8601String()]);

        $this->actingAs($charge, 'sanctum');
        $this->postJson('/api/auth/two-factor/confirm', ['code' => (new Google2FA)->getCurrentOtp($secret)])->assertOk();

        $metadata = $this->cible->fresh()->metadata;
        $this->assertArrayNotHasKey('force_2fa_reconfigure', $metadata);
        $this->assertSame(4, $metadata['failed_login_attempts'] ?? null);
        $this->assertTrue($this->cible->fresh()->two_factor_enabled);
    }

    public function test_l_enrolement_d_un_super_admin_garde_un_echec_croise(): void
    {
        Notification::fake();
        $parrain = User::factory()->create();
        $this->materializeRoleProfile($parrain, 'super_admin');
        Invitation::factory()->create([
            'email' => $this->cible->email,
            'invited_by' => $parrain->id,
            'invited_user_id' => $this->cible->id,
            'agency_id' => null,
            'invitable_type' => null,
            'invitable_id' => null,
            'role' => 'super_admin',
            'status' => InvitationStatus::Accepted->value,
            'accepted_at' => now(),
            'metadata' => ['requires_2fa' => true],
        ]);
        $secret = app(TwoFactorService::class)->generateSecret();
        $this->cible->forceFill([
            'force_2fa_at_first_login' => true,
            'two_factor_secret' => $secret,
            'two_factor_recovery_codes' => json_encode([]),
            'two_factor_enabled' => false,
            'metadata' => ['force_2fa_reconfigure' => true],
        ])->save();
        $charge = $this->cible->fresh();
        $this->metadataEnBase(['force_2fa_reconfigure' => true, 'failed_login_attempts' => 4, 'failed_login_first_at' => now()->toIso8601String()]);

        $this->actingAs($charge);
        $this->postJson('/api/auth/super-admin/2fa/confirm', ['code' => (new Google2FA)->getCurrentOtp($secret)])->assertOk();

        $metadata = $this->cible->fresh()->metadata;
        $this->assertArrayNotHasKey('force_2fa_reconfigure', $metadata);
        $this->assertSame(4, $metadata['failed_login_attempts'] ?? null);
    }

    private function echouer(): void
    {
        $this->postJson('/api/auth/login', ['email' => 'cible@example.com', 'password' => 'mauvais'])->assertUnauthorized();
    }

    /** Le geste joue une fois, à la première lecture du compte visé. */
    private function pendantLaLecture(Closure $geste): void
    {
        $joue = false;
        User::retrieved(function (User $user) use (&$joue, $geste): void {
            if ($joue || $user->id !== $this->cible->id) {
                return;
            }
            $joue = true;
            $geste();
        });
    }

    /** @param  array<string, mixed>  $metadata */
    private function metadataEnBase(array $metadata): void
    {
        DB::table('users')->where('id', $this->cible->id)->update(['metadata' => json_encode($metadata)]);
    }
}
