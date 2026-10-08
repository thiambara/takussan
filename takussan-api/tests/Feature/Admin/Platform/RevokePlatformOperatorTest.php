<?php

namespace Tests\Feature\Admin\Platform;

use App\Domain\Notifications\NotificationCode;
use App\Exceptions\ApiError;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Auth\SuperAdminCooptationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\EnvoisParCode;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0047 §5) — AC14 : retirer un opérateur actif.
 */
class RevokePlatformOperatorTest extends TestCase
{
    use EnvoisParCode;
    use OperateursPlateforme;
    use RefreshDatabase;

    private const MOTIF = 'Fin de mission au support, départ le 30 septembre.';

    public function test_retirer_un_operateur_pose_revoked_at_supprime_ses_jetons_et_journalise_le_motif(): void
    {
        Notification::fake();
        $pair = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $support = $this->operateur(PlatformProfileLevel::Support);
        $support->createToken('console');
        $acteur = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->postJson("/api/admin/super-admins/{$support->id}/revoke", ['reason' => self::MOTIF])
            ->assertOk()
            ->assertJsonPath('data.user_id', $support->id)
            ->assertJsonPath('data.level', 'support');

        $this->assertNotNull($support->platformProfile()->first()->revoked_at);
        $this->assertSame(0, $support->tokens()->count());
        $this->assertFalse($support->fresh()->hasActivePlatformProfile());

        $activite = Activity::query()->where('event', 'super_admin_operator_revoked')->sole();
        $this->assertSame($acteur->id, (int) $activite->causer_id);
        $this->assertSame($support->id, (int) $activite->subject_id);
        $this->assertSame(self::MOTIF, $activite->properties['reason']);

        Notification::assertSentTo($pair, CodedNotification::class, self::deCode(NotificationCode::PlatformOperatorRevoked));
        Notification::assertNotSentTo($acteur, CodedNotification::class, self::deCode(NotificationCode::PlatformOperatorRevoked));
    }

    public function test_le_jeton_d_un_operateur_retire_ne_rouvre_plus_la_console(): void
    {
        $support = $this->operateur(PlatformProfileLevel::Support);
        $jeton = $support->createToken('console');
        $jeton->accessToken->forceFill(['two_factor_verified_at' => now()])->save();
        $this->operateur(PlatformProfileLevel::SuperAdmin);
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->postJson("/api/admin/super-admins/{$support->id}/revoke", ['reason' => self::MOTIF])->assertOk();

        $this->app['auth']->forgetGuards();
        $this->withToken($jeton->plainTextToken)->getJson('/api/admin/system/metrics')->assertUnauthorized();
    }

    public function test_se_retirer_soi_meme_est_refuse(): void
    {
        $this->operateur(PlatformProfileLevel::SuperAdmin);
        $acteur = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->postJson("/api/admin/super-admins/{$acteur->id}/revoke", ['reason' => self::MOTIF])
            ->assertStatus(422)
            ->assertJsonPath('code', 'platform.operator_self_revoke');
        $this->assertTrue($acteur->fresh()->hasActivePlatformProfile());
    }

    /**
     * Le retrait croisé : A retire B pendant que B retire A. Le verrou sérialise les deux ; le
     * second relit et ne trouve plus qu'un `super_admin` actif. Rejoué ici dans l'ordre où le
     * verrou les range : la requête de B, déjà passée par le middleware, arrive après.
     */
    public function test_le_dernier_super_admin_actif_ne_se_retire_pas(): void
    {
        $b = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $a = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->postJson("/api/admin/super-admins/{$b->id}/revoke", ['reason' => self::MOTIF])->assertOk();

        try {
            app(SuperAdminCooptationService::class)->revokeOperator($b, $a, self::MOTIF);
            $this->fail('Le dernier super_admin actif a été retiré.');
        } catch (ApiError $refus) {
            $this->assertSame(422, $refus->getStatusCode());
            $this->assertSame('platform.last_super_admin', $refus->errorCode);
        }

        $this->assertTrue($a->fresh()->hasActivePlatformProfile());
    }

    /** Un acteur retiré entre le middleware et le verrou n'agit plus, même sur un `support`. */
    public function test_un_acteur_retire_entre_temps_ne_retire_personne(): void
    {
        $this->operateur(PlatformProfileLevel::SuperAdmin);
        $support = $this->operateur(PlatformProfileLevel::Support);
        $acteur = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $acteur->platformProfile->forceFill(['revoked_at' => now()])->save();

        try {
            app(SuperAdminCooptationService::class)->revokeOperator($acteur, $support, self::MOTIF);
            $this->fail('Un acteur retiré a retiré un opérateur.');
        } catch (ApiError $refus) {
            $this->assertSame(403, $refus->getStatusCode());
            $this->assertSame('platform.ability_missing', $refus->errorCode);
        }

        $this->assertTrue($support->fresh()->hasActivePlatformProfile());
    }

    public function test_un_support_ne_retire_personne(): void
    {
        $viewer = $this->operateur(PlatformProfileLevel::Viewer);
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->postJson("/api/admin/super-admins/{$viewer->id}/revoke", ['reason' => self::MOTIF])->assertForbidden();
        $this->assertTrue($viewer->fresh()->hasActivePlatformProfile());
    }

    public function test_le_motif_est_requis_et_un_compte_sans_profil_rend_404(): void
    {
        $this->operateur(PlatformProfileLevel::SuperAdmin);
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $support = $this->operateur(PlatformProfileLevel::Support);

        $this->postJson("/api/admin/super-admins/{$support->id}/revoke", [])->assertStatus(422);
        $this->postJson('/api/admin/super-admins/'.User::factory()->create()->id.'/revoke', ['reason' => self::MOTIF])
            ->assertNotFound()
            ->assertJsonPath('code', 'platform.operator_not_found');
    }

    public function test_la_liste_des_operateurs_porte_leur_niveau(): void
    {
        $support = $this->operateur(PlatformProfileLevel::Support);
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $operateurs = collect($this->getJson('/api/admin/super-admins')->assertOk()->json('data.super_admins'));

        $this->assertSame('support', $operateurs->firstWhere('id', $support->id)['level']);
    }
}
