<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use App\Services\Auth\LoginLock;
use App\Services\Auth\PhoneSendQuota;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-622 — la borne par numéro compte les codes ENVOYÉS, pas les requêtes.
 *
 * Mesuré en préproduction le 2026-10-10 : deux envois réels et un clic refusé par le délai de
 * renvoi fermaient le numéro un quart d'heure, et le front n'affichait que « Trop de tentatives ».
 * Le premier test de chaque parcours est rouge sous l'ancien limiteur de route (ablation) : le clic
 * refusé y consommait une place, le deuxième envoi réel rendait 429.
 */
class PhoneSendQuotaTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221770000622';

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        Cache::flush();
        $this->sms = FakeSmsRouter::install();
    }

    // ─── Ce qui ne compte plus ───────────────────────────────────────────────────────────────

    public function test_un_clic_dans_le_delai_de_renvoi_ne_coute_aucune_place(): void
    {
        Sanctum::actingAs(User::factory()->create(['phone' => null, 'phone_verified_at' => null]));

        $this->postJson('/api/auth/phone/send-otp', ['phone' => self::NUMERO])
            ->assertOk()
            ->assertJsonPath('data.retry_after', 60);

        // Deux clics trop tôt : refusés, avec le délai qui reste — et sans rien dépenser.
        foreach ([1, 2] as $_) {
            $refus = $this->postJson('/api/auth/phone/send-otp', ['phone' => self::NUMERO])
                ->assertStatus(429)
                ->assertJsonPath('code', 'phone.resend_too_soon');
            $this->assertGreaterThan(0, $refus->json('retry_after'));
            $this->assertLessThanOrEqual(60, $refus->json('retry_after'));
            $this->assertStringContainsString((string) $refus->json('retry_after'), $refus->json('message'));
        }

        // Les deux envois réels suivants passent : trois codes partis, la borne est atteinte…
        foreach ([1, 2] as $_) {
            $this->travel(61)->seconds();
            $this->postJson('/api/auth/phone/send-otp', ['phone' => self::NUMERO])->assertOk();
        }
        $this->assertCount(3, $this->sms->sentTo(self::NUMERO));

        // … et c'est elle qui refuse le quatrième, en disant combien de minutes attendre.
        $this->travel(61)->seconds();
        $refus = $this->postJson('/api/auth/phone/send-otp', ['phone' => self::NUMERO])
            ->assertStatus(429)
            ->assertJsonPath('code', 'phone.send_limit')
            ->assertHeader('Retry-After');
        $this->assertGreaterThan(60, $refus->json('retry_after'));
        $this->assertCount(3, $this->sms->sentTo(self::NUMERO));
    }

    public function test_connexion_par_telephone_seuls_les_codes_partis_comptent(): void
    {
        // Trois demandes dans la même minute : un seul code part, et un seul compte.
        foreach ([1, 2, 3] as $_) {
            $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->assertStatus(202);
        }
        $this->assertCount(1, $this->sms->sentTo(self::NUMERO));

        // Le délai rendu est celui qui reste, pas une constante.
        $this->travel(30)->seconds();
        $attente = $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->json('data.retry_after');
        $this->assertLessThanOrEqual(30, $attente);

        foreach ([1, 2] as $_) {
            $this->travel(61)->seconds();
            $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->assertStatus(202);
        }
        $this->assertCount(3, $this->sms->sentTo(self::NUMERO));

        $this->travel(61)->seconds();
        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])
            ->assertStatus(429)
            ->assertJsonPath('code', 'phone.send_limit');
    }

    // ─── Ce que la borne ne doit pas trahir ──────────────────────────────────────────────────

    public function test_un_numero_verrouille_se_borne_comme_un_numero_libre(): void
    {
        $verrouille = self::NUMERO;
        $libre = '+221770000623';
        for ($i = 0; $i < LoginLock::MAX_FAILURES; $i++) {
            app(LoginLock::class)->recordNumberFailure($verrouille);
        }
        $this->assertTrue(app(LoginLock::class)->isNumberLocked($verrouille));

        // Quatre fois : une demande, puis la même dans le délai de renvoi, puis une minute.
        $sequence = function (string $numero): array {
            $statuts = [];
            for ($i = 0; $i < 4; $i++) {
                $statuts[] = [
                    $this->postJson('/api/auth/phone/request-code', ['phone' => $numero])->status(),
                    $this->postJson('/api/auth/phone/request-code', ['phone' => $numero])->status(),
                ];
                $this->travel(61)->seconds();
            }

            return $statuts;
        };

        $attendu = [[202, 202], [202, 202], [202, 202], [429, 429]];
        $this->assertSame($attendu, $sequence($libre));
        $this->assertSame($attendu, $sequence($verrouille));
        $this->assertCount(3, $this->sms->sentTo($libre));
        $this->assertSame([], $this->sms->sentTo($verrouille));
    }

    public function test_la_reponse_neutre_compte_comme_un_envoi(): void
    {
        User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        Sanctum::actingAs(User::factory()->create(['phone' => null, 'phone_verified_at' => null]));

        $statuts = [];
        for ($i = 0; $i < 4; $i++) {
            $statuts[] = $this->postJson('/api/auth/phone/send-otp', ['phone' => self::NUMERO])->status();
            $this->travel(61)->seconds();
        }

        $this->assertSame([200, 200, 200, 429], $statuts);
        $this->assertSame([], $this->sms->sentTo(self::NUMERO));
    }

    // ─── Les deux bornes, et leur élargissement hors production ─────────────────────────────

    public function test_la_borne_du_jour_dit_combien_d_heures_attendre(): void
    {
        for ($i = 0; $i < PhoneSendQuota::PER_DAY; $i++) {
            $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->assertStatus(202);
            $this->travel(16)->minutes();
        }
        $this->assertCount(PhoneSendQuota::PER_DAY, $this->sms->sentTo(self::NUMERO));

        $refus = $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])
            ->assertStatus(429)
            ->assertJsonPath('code', 'phone.send_limit_day')
            ->assertJsonPath('params.hours', 23);
        $this->assertGreaterThan(3600, $refus->json('retry_after'));
    }

    public function test_la_ou_le_code_s_affiche_la_borne_s_elargit(): void
    {
        config(['auth.otp_preview.enabled' => true]);

        for ($i = 0; $i < PhoneSendQuota::PER_WINDOW + 2; $i++) {
            $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->assertStatus(202);
            $this->travel(61)->seconds();
        }

        $this->assertCount(PhoneSendQuota::PER_WINDOW + 2, $this->sms->sentTo(self::NUMERO));
    }

    public function test_le_meme_numero_ecrit_autrement_partage_sa_borne(): void
    {
        foreach (['+221770000622', '+221 77 000 06 22', '+221 770 000 622'] as $ecriture) {
            $this->postJson('/api/auth/phone/request-code', ['phone' => $ecriture])->assertStatus(202);
            $this->travel(61)->seconds();
        }

        $this->postJson('/api/auth/phone/request-code', ['phone' => '+22177 000 0622'])
            ->assertStatus(429)
            ->assertJsonPath('code', 'phone.send_limit');
    }

    // ─── Le 429 générique dit aussi quand réessayer ──────────────────────────────────────────

    public function test_le_429_du_limiteur_porte_son_delai_dans_le_corps(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['email' => 'personne@example.com', 'password' => 'x']);
        }

        $refus = $this->postJson('/api/auth/login', ['email' => 'personne@example.com', 'password' => 'x'])
            ->assertStatus(429)
            ->assertJsonPath('code', 'http.too_many_requests');
        $this->assertIsInt($refus->json('retry_after'));
        $this->assertGreaterThan(0, $refus->json('retry_after'));
    }
}
