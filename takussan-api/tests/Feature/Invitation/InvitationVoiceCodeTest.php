<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Services\Auth\LoginLock;
use App\Services\Auth\PhoneSendQuota;
use App\Services\Auth\Voice\LAfricaMobileVoiceCodeSender;
use App\Services\Auth\Voice\VoiceCodeSender;
use Illuminate\Cache\RateLimiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-2940 (ADR-0126) — `POST /api/public/invitations/{token}/code` avec `channel: "voice"` : le même code, dicté par un
 * appel. Mêmes bornes que le SMS (borne par numéro, plafond du jour), voie éteinte sans pilote ni clé (422 sur
 * `channel`, SMS inchangé). Aucun appel réseau réel : un pilote double, et `Http::fake` pour LAfricaMobile.
 */
class InvitationVoiceCodeTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221771234567';

    private FakeSmsRouter $sms;

    private Invitation $invitation;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true, 'auth.phone_login.voice_driver' => '']);
        Cache::flush();
        Mail::fake();
        Http::preventStrayRequests();
        $this->sms = FakeSmsRouter::install();
        $this->withoutMiddleware(ThrottleRequests::class);

        $agency = Agency::factory()->create();
        $profil = OwnerProfile::factory()->create(['agency_id' => $agency->id, 'status' => OwnerProfileStatus::Draft->value, 'user_id' => null]);
        $this->invitation = Invitation::factory()->create([
            'email' => null, 'phone' => self::NUMERO, 'agency_id' => $agency->id,
            'invitable_type' => OwnerProfile::class, 'invitable_id' => $profil->id, 'role' => 'owner',
        ]);
    }

    /** AC1 — drapeau allumé : le pilote reçoit le numéro et le code, aucun SMS ne part, et `…/verify` accepte ce code. */
    public function test_l_appel_dicte_le_code_que_verify_accepte(): void
    {
        $voix = $this->installerVoix();

        $this->code(['channel' => 'voice'])->assertStatus(202)
            ->assertJsonPath('data.channel', 'voice')
            ->assertJsonPath('data.voice_available', true)
            ->assertJsonPath('data.retry_after', 60);

        $this->assertCount(1, $voix->appels);
        [$numero, $code] = $voix->appels[0];
        $this->assertSame(self::NUMERO, $numero);
        $this->assertMatchesRegularExpression('/^\d{6}$/', $code);
        $this->assertSame([], $this->sms->sentTo(self::NUMERO));

        $this->verifier($code)->assertOk()->assertJsonPath('invitation.status', 'accepted');
    }

    /**
     * AC2 — un SMS puis un appel dans la même fenêtre : l'appel part pendant le délai de renvoi du SMS, dicte le MÊME code
     * sans rendre d'essais ni d'échéance, et dépense une place de la borne par numéro — le quatrième envoi est refusé.
     */
    public function test_sms_puis_appel_meme_code_et_meme_borne(): void
    {
        $voix = $this->installerVoix();
        // Une place déjà prise : SMS (2e), appel (3e), puis un nouvel appel serait le 4e sur 3 par quart d'heure.
        app(PhoneSendQuota::class)->hit(self::NUMERO);

        $this->code()->assertStatus(202)->assertJsonPath('data.voice_available', true);
        $codeSms = $this->sms->lastCodeFor(self::NUMERO);
        $this->verifier($codeSms === '000000' ? '111111' : '000000')->assertStatus(422);
        $avant = Cache::get('phone-otp:login:'.self::NUMERO);
        $this->assertSame(1, $avant['attempts']);

        $this->code(['channel' => 'voice'])->assertStatus(202);
        $this->assertCount(1, $voix->appels);
        $this->assertSame($codeSms, $voix->appels[0][1]);
        $apres = Cache::get('phone-otp:login:'.self::NUMERO);
        $this->assertSame([$avant['attempts'], $avant['expires_at'], $avant['hash']], [$apres['attempts'], $apres['expires_at'], $apres['hash']]);
        $this->assertSame(3, app(RateLimiter::class)->attempts('phone-send:'.self::NUMERO));
        $this->assertSame(3, app(RateLimiter::class)->attempts('phone-send-day:'.self::NUMERO));

        // Le délai propre à l'appel passé, la borne partagée refuse le suivant : l'appel ne la contourne pas.
        $this->travel(61)->seconds();
        $this->code(['channel' => 'voice'])->assertStatus(429)->assertJsonPath('code', 'phone.send_limit');
        $this->assertCount(1, $voix->appels);

        $this->verifier($codeSms)->assertOk();
    }

    /** AC2 — le plafond global du jour vaut pour les deux voies : le SMS l'a épuisé, l'appel ne part pas. */
    public function test_le_plafond_du_jour_est_partage(): void
    {
        $voix = $this->installerVoix();
        config(['sms.otp_daily_cap' => 1]);

        $this->code()->assertStatus(202);
        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));
        $this->code(['channel' => 'voice'])->assertStatus(202);

        $this->assertSame([], $voix->appels);
    }

    /** Le verrou du numéro vaut pour l'appel : réponse neutre, aucun appel, et la borne compte comme pour le SMS. */
    public function test_numero_verrouille_aucun_appel(): void
    {
        $voix = $this->installerVoix();
        $verrou = app(LoginLock::class);
        for ($i = 0; $i < LoginLock::MAX_FAILURES; $i++) {
            $verrou->recordNumberFailure(self::NUMERO);
        }
        $this->assertTrue($verrou->isNumberLocked(self::NUMERO));

        $this->code(['channel' => 'voice'])->assertStatus(202)->assertJsonPath('data.retry_after', 60);

        $this->assertSame([], $voix->appels);
        $this->assertNull(Cache::get('phone-otp:login:'.self::NUMERO));
        $this->assertSame(1, app(RateLimiter::class)->attempts('phone-send:'.self::NUMERO));
    }

    /** AC3 — sans pilote : `channel: "voice"` est refusé en 422 sur `channel`, rien ne part, et le SMS fonctionne inchangé. */
    public function test_voie_eteinte_sans_pilote(): void
    {
        $this->code(['channel' => 'voice'])->assertStatus(422)->assertJsonValidationErrors('channel');
        $this->assertSame([], $this->sms->sentTo(self::NUMERO));

        $this->code()->assertStatus(202)
            ->assertJsonPath('data.channel', 'sms')
            ->assertJsonPath('data.voice_available', false);
        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));
        // Voie éteinte, le code n'est gardé que haché : aucune copie chiffrée (ADR-0126 § 3).
        $this->assertArrayNotHasKey('voice', Cache::get('phone-otp:login:'.self::NUMERO));
        $this->verifier($this->sms->lastCodeFor(self::NUMERO))->assertOk();
    }

    /** AC3 — le pilote LAfricaMobile sans l'une de ses clés : voie éteinte, 422 et non 500, aucune requête sortante. */
    public function test_cle_absente_eteint_la_voie(): void
    {
        config([
            'auth.phone_login.voice_driver' => 'lafricamobile',
            'services.lafricamobile_voice' => ['base_url' => 'https://voix.example.test', 'login' => 'compte', 'password' => '', 'lang' => 'fr'],
        ]);

        $this->code(['channel' => 'voice'])->assertStatus(422)->assertJsonValidationErrors('channel');
        $this->code()->assertStatus(202)->assertJsonPath('data.voice_available', false);
        Http::assertNothingSent();
    }

    /** Le pilote LAfricaMobile, sur la forme documentée : jeton par `/login`, puis `push_tts` avec le seul numéro et le code. */
    public function test_pilote_lafricamobile_contre_la_forme_documentee(): void
    {
        config([
            'auth.phone_login.voice_driver' => 'lafricamobile',
            'services.lafricamobile_voice' => ['base_url' => 'https://voix.example.test/', 'login' => 'compte', 'password' => 'secret', 'lang' => 'fr'],
        ]);
        Http::fake([
            'voix.example.test/login' => Http::response(['access_token' => 'jeton-lam', 'token_type' => 'bearer']),
            'voix.example.test/push_tts' => Http::response('"ok"'),
        ]);

        $this->code(['channel' => 'voice'])->assertStatus(202)->assertJsonPath('data.voice_available', true);

        Http::assertSent(fn (HttpRequest $r): bool => $r->url() === 'https://voix.example.test/login'
            && $r->isForm() && $r['username'] === 'compte' && $r['password'] === 'secret');
        $push = collect(Http::recorded())->map(fn (array $paire) => $paire[0])
            ->first(fn (HttpRequest $r): bool => $r->url() === 'https://voix.example.test/push_tts');
        $this->assertNotNull($push);
        $this->assertSame('Bearer jeton-lam', $push->header('Authorization')[0]);
        $this->assertSame(['221771234567'], $push['contacts_list']);
        // La requête de test est en anglais : texte et langue de synthèse en anglais ; tout le reste se dit en français.
        $this->assertSame(['compte', 'secret', 'en'], [$push['login'], $push['password'], $push['to_lang']]);
        $this->assertStringContainsString('Your Takussan code is', $push['text']);
        $this->assertSame(
            'Bonjour. Votre code Takussan est : 0, 4, 2, 0, 0, 7. Je répète : 0, 4, 2, 0, 0, 7. Il expire dans 5 minutes. Ne le communiquez à personne.',
            LAfricaMobileVoiceCodeSender::text('042007', 'wo'),
        );
        $this->assertSame(['text', 'to_lang', 'login', 'password', 'contacts_list'], array_keys($push->data()));

        // Le texte dit le code chiffre par chiffre : c'est ce code que `…/verify` accepte.
        $this->assertMatchesRegularExpression('/(\d, ){5}\d/', $push['text']);
        preg_match('/((?:\d, ){5}\d)/', $push['text'], $m);
        $this->verifier(str_replace(', ', '', $m[1]))->assertOk();
    }

    /** Le pilote `log` : disponible en test et en local seulement, il n'écrit jamais le code. */
    public function test_pilote_log_disponible_en_test(): void
    {
        config(['auth.phone_login.voice_driver' => 'log']);

        $this->code(['channel' => 'voice'])->assertStatus(202)->assertJsonPath('data.voice_available', true);
        $this->assertSame([], $this->sms->sentTo(self::NUMERO));

        $this->app->detectEnvironment(fn () => 'staging');
        $this->code()->assertStatus(202)->assertJsonPath('data.voice_available', false);
    }

    private function installerVoix(): object
    {
        $voix = new class implements VoiceCodeSender
        {
            /** @var list<array{0: string, 1: string}> */
            public array $appels = [];

            public function available(): bool
            {
                return true;
            }

            public function call(string $phone, string $code, ?string $locale): bool
            {
                $this->appels[] = [$phone, $code];

                return true;
            }
        };
        $this->app->instance(VoiceCodeSender::class, $voix);

        return $voix;
    }

    /** @param  array<string, mixed>  $corps */
    private function code(array $corps = []): TestResponse
    {
        return $this->postJson("/api/public/invitations/{$this->invitation->token}/code", $corps);
    }

    private function verifier(string $code): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->postJson("/api/public/invitations/{$this->invitation->token}/verify", [
            'code' => $code, 'first_name' => 'Moussa', 'last_name' => 'Ndiaye',
        ]);
    }
}
