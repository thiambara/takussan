<?php

namespace Tests\Feature\Admin\Platform;

use App\Domain\Notifications\NotificationCode;
use App\Models\Enums\ImpersonationEndReason;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\UserStatus;
use App\Models\ImpersonationSession;
use App\Models\Profiles\PlatformProfile;
use App\Notifications\CodedNotification;
use App\Services\Admin\ImpersonationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\PersonalAccessToken;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\EnvoisParCode;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0055 §2 et §4) — AC5e : fin explicite, expiration, révocation.
 */
class ImpersonationLifecycleTest extends TestCase
{
    use EnvoisParCode;
    use RefreshDatabase;
    use SessionsDImpersonation;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    /** AC5e — `stop` par l'opérateur. */
    public function test_stop_ferme_la_session_tue_le_jeton_journalise_et_previent_la_cible(): void
    {
        ['operateur' => $operateur, 'cible' => $cible, 'jeton' => $jeton, 'session_id' => $id] = $this->ouvrirUneSession();
        $this->travel(3)->minutes();

        $this->commeOperateur($operateur)->postJson('/api/admin/impersonate/stop')
            ->assertOk()
            ->assertJsonPath('data.session_id', $id);

        $this->avecLeJeton($jeton)->getJson('/api/auth/me')->assertUnauthorized();
        $session = ImpersonationSession::query()->findOrFail($id);
        $this->assertNotNull($session->ended_at);
        $this->assertSame(ImpersonationEndReason::Stopped, $session->end_reason);
        $this->assertNull(PersonalAccessToken::findToken($jeton));

        $fin = Activity::query()->where('event', 'super_admin_impersonation_stopped')->sole();
        $this->assertSame($operateur->id, (int) $fin->causer_id);
        $this->assertSame($cible->id, (int) $fin->subject_id);
        $this->assertSame('stopped', $fin->properties['end_reason']);
        $this->assertSame(180, $fin->properties['duration_seconds']);
        $this->assertSame(1, self::nombreDEnvois($cible, NotificationCode::ImpersonationEnded));
        Notification::assertSentTo($cible, CodedNotification::class, fn (CodedNotification $n) => $n->code === NotificationCode::ImpersonationEnded
            && $n->params['reason'] === self::MOTIF_IMPERSONATION);

        // Idempotent : une seconde fermeture ne trouve rien, ne journalise ni ne notifie plus.
        $this->commeOperateur($operateur)->postJson('/api/admin/impersonate/stop')->assertNotFound();
        app(ImpersonationService::class)->stop($session, ImpersonationEndReason::Expired);
        $this->assertSame(1, Activity::query()->where('event', 'super_admin_impersonation_stopped')->count());
        $this->assertSame(1, self::nombreDEnvois($cible, NotificationCode::ImpersonationEnded));
    }

    /** AC5e — `stop` ferme la session DE L'APPELANT : plus de `user_id` libre. */
    public function test_stop_d_un_autre_operateur_ne_ferme_pas_la_session(): void
    {
        ['cible' => $cible, 'jeton' => $jeton, 'session_id' => $id] = $this->ouvrirUneSession();
        $autre = $this->operateur(PlatformProfileLevel::SuperAdmin);

        $this->commeOperateur($autre)->postJson('/api/admin/impersonate/stop', ['user_id' => $cible->id])
            ->assertNotFound()
            ->assertJsonPath('code', 'impersonation.no_session');

        $this->assertTrue(ImpersonationSession::query()->findOrFail($id)->isOpen());
        $this->avecLeJeton($jeton)->getJson('/api/auth/me')->assertOk();
    }

    /** AC5e — échéance : la commande ferme, une fois, avec un seul avis. */
    public function test_une_session_echue_est_fermee_par_la_commande_une_seule_fois(): void
    {
        ['cible' => $cible, 'jeton' => $jeton, 'session_id' => $id] = $this->ouvrirUneSession();

        $this->travel(ImpersonationSession::TTL_MINUTES)->minutes();
        $this->travel(1)->seconds();
        $this->avecLeJeton($jeton)->getJson('/api/auth/me')->assertUnauthorized();

        $this->artisan('impersonation:close-expired')->assertSuccessful();
        $this->artisan('impersonation:close-expired')->assertSuccessful();

        $session = ImpersonationSession::query()->findOrFail($id);
        $this->assertSame(ImpersonationEndReason::Expired, $session->end_reason);
        $this->assertSame(1, self::nombreDEnvois($cible, NotificationCode::ImpersonationEnded));
        $this->assertSame(1, Activity::query()->where('event', 'super_admin_impersonation_stopped')->count());
    }

    public function test_la_commande_ne_ferme_pas_une_session_en_cours(): void
    {
        ['session_id' => $id] = $this->ouvrirUneSession();
        $this->travel(ImpersonationSession::TTL_MINUTES - 1)->minutes();

        $this->artisan('impersonation:close-expired')->assertSuccessful();

        $this->assertTrue(ImpersonationSession::query()->findOrFail($id)->isOpen());
        Notification::assertNothingSent();
    }

    /** AC5e — opérateur retiré par la console : session fermée (`operator_revoked`), jeton mort. */
    public function test_le_retrait_de_l_operateur_ferme_ses_sessions(): void
    {
        ['operateur' => $operateur, 'cible' => $cible, 'jeton' => $jeton, 'session_id' => $id] = $this->ouvrirUneSession();
        $pair = $this->operateur(PlatformProfileLevel::SuperAdmin);

        $this->commeOperateur($pair)
            ->postJson("/api/admin/super-admins/{$operateur->id}/revoke", ['reason' => 'Départ de l\'équipe support.'])
            ->assertOk();

        $this->avecLeJeton($jeton)->getJson('/api/auth/me')->assertUnauthorized();
        $this->assertSame(ImpersonationEndReason::OperatorRevoked, ImpersonationSession::query()->findOrFail($id)->end_reason);
        $this->assertSame(1, self::nombreDEnvois($cible, NotificationCode::ImpersonationEnded));
    }

    /**
     * Second chemin d'AC5e : le profil de l'opérateur perd son niveau, ou son compte est bloqué,
     * SANS passer par un service qui fermerait la session. Le jeton tombe quand même à la requête
     * suivante : c'est la branche d'`AccessTokenGate`, pas la fermeture, qui le refuse.
     */
    public function test_le_jeton_tombe_des_que_l_operateur_n_est_plus_super_admin_actif(): void
    {
        $cas = [
            'retrait' => fn ($op) => PlatformProfile::query()->where('user_id', $op->id)->update(['revoked_at' => now()]),
            'niveau' => fn ($op) => PlatformProfile::query()->where('user_id', $op->id)->update(['level' => PlatformProfileLevel::Support->value]),
            'blocage' => fn ($op) => $op->forceFill(['status' => UserStatus::Blocked])->save(),
        ];

        foreach ($cas as $nom => $retirer) {
            ['operateur' => $operateur, 'jeton' => $jeton, 'session_id' => $id] = $this->ouvrirUneSession();
            $this->avecLeJeton($jeton)->getJson('/api/auth/me')->assertOk();

            $retirer($operateur);

            $this->avecLeJeton($jeton)->getJson('/api/auth/me')->assertUnauthorized();
            $this->assertNull(ImpersonationSession::query()->findOrFail($id)->ended_at, $nom);
        }
    }

    /** Second chemin : une session fermée dont le jeton aurait survécu ne rouvre rien. */
    public function test_un_jeton_survivant_d_une_session_fermee_est_refuse(): void
    {
        ['jeton' => $jeton, 'session_id' => $id] = $this->ouvrirUneSession();
        ImpersonationSession::query()->whereKey($id)->update(['ended_at' => now(), 'end_reason' => 'stopped']);

        $this->assertNotNull(PersonalAccessToken::findToken($jeton));
        $this->avecLeJeton($jeton)->getJson('/api/auth/me')->assertUnauthorized();
    }

    /** Bloquer la cible depuis la console ferme les sessions qui la visent (`target_blocked`). */
    public function test_bloquer_la_cible_ferme_la_session(): void
    {
        ['cible' => $cible, 'jeton' => $jeton, 'session_id' => $id] = $this->ouvrirUneSession();

        $this->commeOperateur($this->operateur(PlatformProfileLevel::Support))
            ->postJson("/api/admin/users/{$cible->id}/block", ['reason' => 'Fraude signalée, dossier 2026-114.'])
            ->assertOk();

        $this->avecLeJeton($jeton)->getJson('/api/auth/me')->assertUnauthorized();
        $this->assertSame(ImpersonationEndReason::TargetBlocked, ImpersonationSession::query()->findOrFail($id)->end_reason);
        $this->assertSame(1, self::nombreDEnvois($cible, NotificationCode::ImpersonationEnded));
    }
}
