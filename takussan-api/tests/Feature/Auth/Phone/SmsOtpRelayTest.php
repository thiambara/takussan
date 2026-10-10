<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse M3 — `send-otp` envoyait un VRAI SMS, drapeau éteint, vers tout
 * numéro E.164 du monde, borné seulement par compte (`throttle:3,1`) : chaque compte neuf visait
 * un numéro neuf. Rouge sur `e59cb8b2` : six comptes, une IP, six numéros étrangers → 200 ×6 et
 * six SMS remis.
 *
 * Désormais : liste blanche d'indicatifs (`sms.otp_allowed_country_codes`, défaut `221`), le
 * limiteur `auth-phone-send` (par IP) et la borne `PhoneSendQuota` (par numéro, codes envoyés — TCK-622) sur `send-otp` et `resend`, et un
 * plafond global journalier de codes (`sms.otp_daily_cap`).
 */
class SmsOtpRelayTest extends TestCase
{
    use RefreshDatabase;

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->sms = FakeSmsRouter::install();
    }

    public function test_la_sequence_du_verificateur_ne_remet_aucun_sms_a_l_etranger(): void
    {
        $this->assertFalse((bool) config('auth.phone_login.enabled'));

        foreach (['+447700900001', '+447700900002', '+12025550101', '+12025550102', '+4915112345601', '+4915112345602'] as $numero) {
            $compte = $this->compte();
            $this->depuis('10.1.1.1')->postJson('/api/auth/phone/send-otp', ['phone' => $numero])
                ->assertStatus(422)
                ->assertJsonPath('code', 'phone_country_not_allowed');
            $this->assertNull($compte->fresh()->phone, 'rien n\'est écrit');
        }

        $this->assertSame([], $this->sms->sent);
    }

    public function test_une_ip_ne_relaie_pas_plus_de_vingt_codes_par_heure(): void
    {
        $statuts = [];
        for ($i = 0; $i < 25; $i++) {
            $this->compte();
            $statuts[] = $this->depuis('10.1.1.2')
                ->postJson('/api/auth/phone/send-otp', ['phone' => sprintf('+22177%07d', 9300 + $i)])
                ->status();
        }

        $this->assertSame(array_fill(0, 20, 200), array_slice($statuts, 0, 20));
        $this->assertSame(array_fill(0, 5, 429), array_slice($statuts, 20));
        $this->assertCount(20, $this->sms->sent);
    }

    public function test_un_numero_destinataire_ne_recoit_pas_plus_de_trois_codes_par_quart_d_heure(): void
    {
        $numero = '+221770009400';
        for ($i = 0; $i < 4; $i++) {
            $this->compte();
            $reponse = $this->depuis("10.1.2.{$i}")->postJson('/api/auth/phone/send-otp', ['phone' => $numero]);
            $i < 3 ? $reponse->assertOk() : $reponse->assertStatus(429);
        }

        $this->assertCount(3, $this->sms->sentTo($numero));
    }

    /** Sans corps, le numéro destinataire est celui du compte : jamais une clé vide partagée. */
    public function test_sans_corps_le_limiteur_compte_le_numero_du_compte(): void
    {
        $this->compte('+221770009501');
        for ($i = 0; $i < 3; $i++) {
            $this->travel(61)->seconds();
            $this->postJson('/api/auth/phone/send-otp')->assertOk();
        }
        $this->travel(61)->seconds();
        $this->postJson('/api/auth/phone/send-otp')->assertStatus(429);

        $this->compte('+221770009502');
        $this->postJson('/api/auth/phone/send-otp')->assertOk();
    }

    public function test_le_plafond_journalier_arrete_les_codes_et_alerte_une_fois(): void
    {
        config(['sms.otp_daily_cap' => 2]);
        Log::spy();

        foreach (['+221770009601', '+221770009602'] as $numero) {
            $this->compte();
            $this->postJson('/api/auth/phone/send-otp', ['phone' => $numero])->assertOk();
        }
        foreach (['+221770009603', '+221770009604'] as $numero) {
            $this->compte();
            $this->postJson('/api/auth/phone/send-otp', ['phone' => $numero])
                ->assertStatus(503)
                ->assertJsonPath('code', 'sms_capacity_reached');
        }

        $this->assertCount(2, $this->sms->sent);
        Log::shouldHaveReceived('alert')->once();

        // Le lendemain (UTC), le compteur repart.
        $this->travelTo(now('UTC')->addDay()->startOfDay()->addMinute());
        $this->compte();
        $this->postJson('/api/auth/phone/send-otp', ['phone' => '+221770009605'])->assertOk();
    }

    public function test_la_connexion_par_telephone_refuse_un_indicatif_hors_liste_sans_envoyer(): void
    {
        config(['auth.phone_login.enabled' => true]);

        $this->postJson('/api/auth/phone/request-code', ['phone' => '+447700900001'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'phone_country_not_allowed');
        $this->postJson('/api/auth/phone/request-code', ['phone' => '+221770009700'])->assertStatus(202);

        $this->assertCount(1, $this->sms->sent);
    }

    public function test_un_indicatif_ajoute_par_configuration_est_servi(): void
    {
        config(['sms.otp_allowed_country_codes' => ['221', '33']]);
        $this->compte();

        $this->postJson('/api/auth/phone/send-otp', ['phone' => '+33612345678'])->assertOk();
        $this->assertCount(1, $this->sms->sentTo('+33612345678'));
    }

    private function compte(?string $telephone = null): User
    {
        $compte = User::factory()->create(['phone' => $telephone, 'phone_verified_at' => null]);
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($compte);

        return $compte;
    }

    private function depuis(string $ip): static
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip]);
    }
}
