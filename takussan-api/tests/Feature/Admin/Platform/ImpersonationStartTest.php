<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Enums\ImpersonationEndReason;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\UserStatus;
use App\Models\ImpersonationSession;
use App\Models\User;
use App\Services\Admin\ImpersonationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0055 §1) — AC5a et AC5b : démarrer une session d'impersonation.
 */
class ImpersonationStartTest extends TestCase
{
    use RefreshDatabase;
    use SessionsDImpersonation;

    /** AC5a. */
    public function test_le_motif_est_requis_puis_la_session_porte_un_jeton_de_lecture_de_quinze_minutes(): void
    {
        $operateur = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $cible = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $this->commeOperateur($operateur);

        $this->postJson("/api/admin/users/{$cible->id}/impersonate")->assertStatus(422);
        $this->postJson("/api/admin/users/{$cible->id}/impersonate", ['reason' => 'court'])->assertStatus(422);
        $this->assertSame(0, ImpersonationSession::query()->count());

        $data = $this->postJson("/api/admin/users/{$cible->id}/impersonate", ['reason' => self::MOTIF_IMPERSONATION])
            ->assertCreated()
            ->assertJsonPath('data.target.id', $cible->id)
            ->assertJsonPath('data.target.name', 'Awa Ndiaye')
            ->json('data');

        $jeton = PersonalAccessToken::findToken($data['token']);
        $this->assertNotNull($jeton);
        $this->assertSame($cible->id, (int) $jeton->tokenable_id);
        $this->assertSame([ImpersonationService::ABILITY], $jeton->abilities);
        $this->assertTrue($jeton->expires_at->lte(now()->addMinutes(15)));
        $this->assertNull($jeton->two_factor_verified_at);

        $session = ImpersonationSession::query()->sole();
        $this->assertSame($data['session_id'], $session->id);
        $this->assertTrue($session->isOpen());
        $this->assertSame(self::MOTIF_IMPERSONATION, $session->reason);
        $this->assertSame($operateur->id, $session->impersonator_id);
        $this->assertSame($jeton->id, $session->personal_access_token_id);

        $debut = Activity::query()->where('event', 'super_admin_impersonation_started')->sole();
        $this->assertSame($operateur->id, (int) $debut->causer_id);
        $this->assertSame($cible->id, (int) $debut->subject_id);
        $this->assertSame(self::MOTIF_IMPERSONATION, $debut->properties['reason']);
        $this->assertSame($session->id, $debut->properties['session_id']);
    }

    /** AC5b — tout opérateur actif, tout niveau ; tout compte non actif ; soi-même. */
    public function test_les_cibles_interdites_sont_refusees_sans_jeton(): void
    {
        $operateur = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $refus = [
            'impersonation.target_operator' => [
                $this->operateur(PlatformProfileLevel::SuperAdmin),
                $this->operateur(PlatformProfileLevel::Support),
                $this->operateur(PlatformProfileLevel::Viewer),
            ],
            'impersonation.target_inactive' => [
                User::factory()->create(['status' => UserStatus::Blocked]),
                User::factory()->create(['status' => UserStatus::Inactive]),
            ],
            'impersonation.target_self' => [$operateur],
        ];

        $this->commeOperateur($operateur);
        foreach ($refus as $code => $cibles) {
            foreach ($cibles as $cible) {
                $this->postJson("/api/admin/users/{$cible->id}/impersonate", ['reason' => self::MOTIF_IMPERSONATION])
                    ->assertStatus(422)
                    ->assertJsonPath('code', $code);
            }
        }

        $this->assertSame(0, PersonalAccessToken::query()->where('name', ImpersonationService::TOKEN_NAME)->count());
        $this->assertSame(0, ImpersonationSession::query()->count());
    }

    /** AC5b — réservée au `super_admin`. */
    public function test_support_et_viewer_n_impersonnent_pas(): void
    {
        $cible = User::factory()->create();
        foreach ([PlatformProfileLevel::Support, PlatformProfileLevel::Viewer] as $niveau) {
            $this->commeOperateur($this->operateur($niveau));
            $this->postJson("/api/admin/users/{$cible->id}/impersonate", ['reason' => self::MOTIF_IMPERSONATION])
                ->assertForbidden();
        }

        $this->assertSame(0, ImpersonationSession::query()->count());
    }

    /** AC5b — sans step-up récent sur CE jeton : refus de TCK-589, avant même la validation. */
    public function test_sans_step_up_recent_le_demarrage_est_refuse(): void
    {
        $operateur = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $cible = User::factory()->create();
        $sansStepUp = $operateur->createToken('test')->plainTextToken;

        $this->avecLeJeton($sansStepUp)
            ->postJson("/api/admin/users/{$cible->id}/impersonate", ['reason' => self::MOTIF_IMPERSONATION])
            ->assertForbidden()
            ->assertJsonPath('code', 'two_factor_step_up_required');
        $this->assertSame(0, ImpersonationSession::query()->count());
    }

    /** Une session à la fois par opérateur : la précédente se ferme, son jeton tombe. */
    public function test_une_nouvelle_session_ferme_la_precedente(): void
    {
        $premiere = $this->ouvrirUneSession();
        $seconde = $this->ouvrirUneSession($premiere['operateur']);

        $fermee = ImpersonationSession::query()->findOrFail($premiere['session_id']);
        $this->assertSame(ImpersonationEndReason::Stopped, $fermee->end_reason);
        $this->assertNull(PersonalAccessToken::findToken($premiere['jeton']));
        $this->assertTrue(ImpersonationSession::query()->findOrFail($seconde['session_id'])->isOpen());

        $this->avecLeJeton($premiere['jeton'])->getJson('/api/auth/me')->assertUnauthorized();
        $this->avecLeJeton($seconde['jeton'])->getJson('/api/auth/me')->assertOk();
    }
}
