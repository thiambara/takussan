<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FakeSmsRouter;
use Tests\Support\JournalCapture;
use Tests\Support\ReadsPhoneCodes;
use Tests\TestCase;

/**
 * TCK-633 (lot C, AC8) — le second numéro : vérifié par code (portée distincte), refusé s'il est
 * le principal du compte ou un numéro vérifié d'un autre compte, jamais un identifiant de
 * connexion, jamais en clair dans les journaux.
 *
 * Décision 2 du porteur (2026-10-12) : un numéro vérifié n'appartient qu'à UN compte, principal ou
 * second. Les chemins qui rendent un numéro principal (vérification du profil, connexion et
 * inscription par téléphone) le jugent aussi contre les seconds numéros vérifiés.
 */
class SecondaryPhoneTest extends TestCase
{
    use JournalCapture, ReadsPhoneCodes, RefreshDatabase;

    private const PRINCIPAL = '+221770000601';

    private const SECOND = '+221770000602';

    private FakeSmsRouter $sms;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->sms = FakeSmsRouter::install();
        $this->user = User::factory()->create(['phone' => self::PRINCIPAL, 'phone_verified_at' => now()]);
        Sanctum::actingAs($this->user);
    }

    private function envoyer(string $numero): TestResponse
    {
        return $this->postJson('/api/auth/secondary-phone/send-otp', ['phone' => $numero]);
    }

    private function ajouter(string $numero, bool $whatsapp = false): TestResponse
    {
        $this->envoyer($numero)->assertOk()->assertJsonPath('data.sent', true);

        return $this->postJson('/api/auth/secondary-phone/verify', [
            'phone' => $numero,
            'code' => $this->sms->lastCodeFor($numero),
            'whatsapp' => $whatsapp,
        ]);
    }

    public function test_ajoute_verifie_et_retire_un_second_numero(): void
    {
        $this->ajouter(self::SECOND, true)->assertOk()
            ->assertJsonPath('secondary_phone', self::SECOND)
            ->assertJsonPath('secondary_phone_whatsapp', true);
        $this->assertNotNull($this->user->fresh()->secondary_phone_verified_at);
        $this->assertSame(self::PRINCIPAL, $this->user->fresh()->phone);

        $this->deleteJson('/api/auth/secondary-phone')->assertOk()->assertJsonPath('secondary_phone', null);
        $frais = $this->user->fresh();
        $this->assertNull($frais->secondary_phone);
        $this->assertNull($frais->secondary_phone_verified_at);
        $this->assertFalse($frais->secondary_phone_whatsapp);
    }

    /** Le second numéro est écrit sous sa forme CANONIQUE, celle que juge l'unicité. */
    public function test_le_second_numero_est_range_sous_forme_canonique(): void
    {
        $this->envoyer(self::SECOND)->assertOk();
        $this->postJson('/api/auth/secondary-phone/verify', [
            'phone' => self::SECOND, 'code' => $this->sms->lastCodeFor(self::SECOND),
        ])->assertOk()->assertJsonPath('secondary_phone_whatsapp', false);

        $this->assertSame(self::SECOND, $this->user->fresh()->secondary_phone);
    }

    public function test_un_mauvais_code_ne_verifie_rien(): void
    {
        $this->envoyer(self::SECOND)->assertOk();
        $faux = $this->sms->lastCodeFor(self::SECOND) === '000000' ? '111111' : '000000';

        $this->postJson('/api/auth/secondary-phone/verify', ['phone' => self::SECOND, 'code' => $faux])
            ->assertUnprocessable()->assertJsonPath('code', 'secondary_phone.code_invalid');
        $this->assertNull($this->user->fresh()->secondary_phone);
    }

    /** Le code du numéro principal ne vérifie pas le second : la portée est distincte. */
    public function test_le_code_du_principal_ne_vaut_pas_pour_le_second(): void
    {
        $autre = User::factory()->create(['phone' => self::SECOND, 'phone_verified_at' => null]);
        $codeDuPrincipalDAutrui = $this->issuePhoneCode($autre);

        $this->postJson('/api/auth/secondary-phone/verify', ['phone' => self::SECOND, 'code' => $codeDuPrincipalDAutrui])
            ->assertUnprocessable()->assertJsonPath('code', 'secondary_phone.code_invalid');
        $this->assertNull($this->user->fresh()->secondary_phone);
    }

    /** Le code de l'entrée par téléphone (portée `login`) ne vérifie pas non plus le second. */
    public function test_le_code_de_connexion_ne_vaut_pas_pour_le_second(): void
    {
        config(['auth.phone_login.enabled' => true]);
        $this->postJson('/api/auth/phone/request-code', ['phone' => self::SECOND])->assertStatus(202);
        $codeDeConnexion = $this->sms->lastCodeFor(self::SECOND);

        $this->postJson('/api/auth/secondary-phone/verify', ['phone' => self::SECOND, 'code' => $codeDeConnexion])
            ->assertUnprocessable()->assertJsonPath('code', 'secondary_phone.code_invalid');
        $this->assertNull($this->user->fresh()->secondary_phone);
    }

    public function test_le_numero_principal_du_compte_est_refuse(): void
    {
        $this->envoyer(self::PRINCIPAL)->assertUnprocessable()->assertJsonPath('code', 'secondary_phone.same_as_primary');
        $this->assertSame([], $this->sms->sentTo(self::PRINCIPAL));
    }

    /**
     * Vérification adverse m4 (décision du porteur, `PhoneVerificationController::neutralSend`) :
     * un numéro vérifié AILLEURS reçoit la réponse d'un envoi réel, sans SMS — la réponse ne dit
     * pas qu'il est inscrit. Il n'est jamais enregistré : aucun code n'existe pour lui.
     */
    public function test_le_principal_verifie_d_un_autre_compte_est_refuse_sans_le_dire(): void
    {
        User::factory()->create(['phone' => self::SECOND, 'phone_verified_at' => now()]);

        $this->envoyer(self::SECOND)->assertOk()->assertJsonPath('data.sent', true);
        $this->assertSame([], $this->sms->sentTo(self::SECOND));
        $this->postJson('/api/auth/secondary-phone/verify', ['phone' => self::SECOND, 'code' => '123456'])
            ->assertUnprocessable()->assertJsonPath('code', 'secondary_phone.code_invalid');
        $this->assertNull($this->user->fresh()->secondary_phone);
    }

    public function test_le_second_verifie_d_un_autre_compte_est_refuse(): void
    {
        User::factory()->create()->forceFill(['secondary_phone' => self::SECOND, 'secondary_phone_verified_at' => now()])->save();

        $this->envoyer(self::SECOND)->assertOk();
        $this->assertSame([], $this->sms->sentTo(self::SECOND));
    }

    public function test_un_numero_pris_entre_l_envoi_et_la_verification_rend_409(): void
    {
        $this->envoyer(self::SECOND)->assertOk();
        $code = $this->sms->lastCodeFor(self::SECOND);
        User::factory()->create(['phone' => self::SECOND, 'phone_verified_at' => now()]);

        $this->postJson('/api/auth/secondary-phone/verify', ['phone' => self::SECOND, 'code' => $code])
            ->assertStatus(409)->assertJsonPath('code', 'secondary_phone.taken');
        $this->assertNull($this->user->fresh()->secondary_phone);
    }

    public function test_un_numero_injoignable_est_refuse_a_la_validation(): void
    {
        $this->envoyer('+330612345678')->assertUnprocessable()->assertJsonValidationErrors(['phone']);
        $this->envoyer('770000602')->assertUnprocessable()->assertJsonValidationErrors(['phone']);
    }

    public function test_les_routes_exigent_une_session(): void
    {
        foreach (['send-otp', 'verify', 'destroy'] as $nom) {
            $route = app('router')->getRoutes()->getByName("auth.secondary-phone.{$nom}");
            $this->assertNotNull($route, $nom);
            $this->assertContains('auth:sanctum', $route->gatherMiddleware(), $nom);
        }
    }

    /**
     * AC8 et décision 2 — le second numéro n'ouvre pas le compte qui le porte, et l'entrée par
     * téléphone ne l'adopte pas non plus comme principal d'un compte NEUF : 409 `phone.taken`.
     */
    public function test_le_second_numero_n_ouvre_aucun_compte(): void
    {
        config(['auth.phone_login.enabled' => true]);
        $this->ajouter(self::SECOND)->assertOk();
        $this->app['auth']->forgetGuards();
        $this->travel(61)->seconds();
        $comptes = User::query()->count();

        $this->postJson('/api/auth/phone/request-code', ['phone' => self::SECOND])->assertStatus(202);
        $this->postJson('/api/auth/phone/verify-code', [
            'phone' => self::SECOND,
            'code' => $this->sms->lastCodeFor(self::SECOND),
        ])->assertStatus(409)->assertJsonPath('code', 'phone.taken')->assertJsonMissingPath('token');

        $this->assertSame($comptes, User::query()->count());
        $this->assertSame(0, User::query()->where('phone', self::SECOND)->count());
    }

    /** Décision 2 — vérifier en PRINCIPAL le second numéro vérifié d'un autre compte : 409. */
    public function test_le_second_d_un_autre_ne_se_verifie_pas_en_principal(): void
    {
        User::factory()->create()->forceFill(['secondary_phone' => self::SECOND, 'secondary_phone_verified_at' => now()])->save();
        $moi = User::factory()->create(['phone' => self::SECOND, 'phone_verified_at' => null]);
        Sanctum::actingAs($moi);

        // L'envoi est neutre (aucun SMS), comme pour un principal pris.
        $this->postJson('/api/auth/phone/send-otp')->assertOk()->assertJsonPath('data.sent', true);
        $this->assertSame([], $this->sms->sentTo(self::SECOND));

        // Un code obtenu malgré tout (onboarding, ancien envoi) ne vérifie rien.
        $this->travel(61)->seconds();
        $code = $this->issuePhoneCode($moi->fresh());
        $this->postJson('/api/auth/phone/verify-otp', ['code' => $code])
            ->assertStatus(409)->assertJsonPath('code', 'phone.taken');
        $this->assertNull($moi->fresh()->phone_verified_at);
    }

    /** Promouvoir SON PROPRE second numéro en principal le retire des seconds : aucun doublon. */
    public function test_son_propre_second_devient_principal_sans_doublon(): void
    {
        $this->ajouter(self::SECOND)->assertOk();
        $this->user->forceFill(['phone' => self::SECOND, 'phone_verified_at' => null])->save();

        app(PhoneVerificationService::class)->markVerified($this->user->fresh(), self::SECOND);

        $frais = $this->user->fresh();
        $this->assertNotNull($frais->phone_verified_at);
        $this->assertNull($frais->secondary_phone);
        $this->assertNull($frais->secondary_phone_verified_at);
    }

    /**
     * Correction du lot C, tour 2 — la réponse WhatsApp suit le NUMÉRO : son second devenu
     * principal emporte la sienne, et celle de l'ancien principal ne vaut plus.
     */
    public function test_son_second_devenu_principal_emporte_sa_reponse_whatsapp(): void
    {
        $this->ajouter(self::SECOND)->assertOk();
        $this->user->forceFill(['phone_whatsapp' => false, 'secondary_phone_whatsapp' => true])->save();
        $this->user->forceFill(['phone' => self::SECOND, 'phone_verified_at' => null])->save();

        app(PhoneVerificationService::class)->markVerified($this->user->fresh(), self::SECOND);

        $frais = $this->user->fresh();
        $this->assertSame(self::SECOND, $frais->phone);
        $this->assertTrue($frais->phone_whatsapp);
        $this->assertFalse($frais->secondary_phone_whatsapp);
    }

    public function test_le_numero_n_est_jamais_journalise_en_clair(): void
    {
        $this->captureJournal();
        $this->ajouter(self::SECOND)->assertOk();
        $this->deleteJson('/api/auth/secondary-phone')->assertOk();

        $this->assertJournalSansTemoin(self::SECOND, '770000602');
        $this->assertFalse(Activity::query()->get()->contains(
            fn (Activity $a) => str_contains((string) json_encode($a->properties), '770000602'),
        ));
    }
}
