<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PhoneVerificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_verify_fails_without_a_matching_otp_in_cache(): void
    {
        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/verify-phone', ['code' => '123456'])
            ->assertStatus(422);

        $this->assertNull($user->fresh()->phone_verified_at);
    }

    public function test_verify_with_cached_code_marks_phone_verified(): void
    {
        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $service = app(PhoneVerificationService::class);
        $code = $service->sendOtp($user);
        $this->assertNotNull($code);

        $this->postJson('/api/auth/verify-phone', ['code' => $code])
            ->assertOk()
            ->assertJsonPath('data.verified', true);

        $this->assertNotNull($user->fresh()->phone_verified_at);
    }

    public function test_verify_requires_six_digit_code(): void
    {
        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/verify-phone', ['code' => '12'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['code']);
    }

    public function test_verify_fails_if_phone_already_verified(): void
    {
        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => now()]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/verify-phone', ['code' => '123456'])->assertStatus(422);
    }

    public function test_send_otp_returns_debug_code_outside_production(): void
    {
        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/auth/phone/send-otp')
            ->assertOk();

        $this->assertTrue($response->json('data.sent'));
        $this->assertMatchesRegularExpression('/^\d{6}$/', $response->json('data.debug_code'));
    }

    public function test_send_otp_enforces_cooldown(): void
    {
        Cache::flush();
        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/send-otp')->assertOk();
        $this->postJson('/api/auth/phone/send-otp')->assertStatus(429);
    }

    public function test_resend_fails_if_no_phone_on_file(): void
    {
        $user = User::factory()->create(['phone' => null, 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/resend')->assertStatus(422);
    }

    public function test_resend_fails_if_phone_already_verified(): void
    {
        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => now()]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/resend')->assertStatus(422);
    }

    public function test_both_endpoints_require_auth(): void
    {
        $this->postJson('/api/auth/verify-phone', ['code' => '123456'])->assertUnauthorized();
        $this->postJson('/api/auth/phone/resend')->assertUnauthorized();
        $this->postJson('/api/auth/phone/send-otp')->assertUnauthorized();
        $this->postJson('/api/auth/phone/verify-otp', ['code' => '123456'])->assertUnauthorized();
    }

    /**
     * TCK-566 — retour testeur du 2026-09-23. L'assistant « Publier votre premier
     * bien » amorçait le champ avec la VALEUR `+221` ; un curseur posé en tête et
     * le numéro partait sous la forme `780143710+221`. Cet endpoint l'enregistrait
     * tel quel sur l'utilisateur, émettait un code — que le SMS n'aurait jamais pu
     * acheminer (`PhoneNumber::isValid` le refuse en aval) —, et la vérification
     * marquait ensuite « vérifié » un numéro qui n'en était pas un.
     */
    public function test_send_otp_refuse_un_numero_hors_e164_sans_rien_enregistrer(): void
    {
        Cache::flush();
        $user = User::factory()->create(['phone' => null, 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/send-otp', ['phone' => '780143710+221'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);

        $this->assertNull($user->fresh()->phone);
        $this->assertFalse(Cache::has("phone-otp:{$user->id}"));
    }

    public function test_send_otp_refuse_un_numero_senegalais_incomplet(): void
    {
        Cache::flush();
        $user = User::factory()->create(['phone' => null, 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        // Huit chiffres après +221 : E.164 valide en apparence (11 chiffres),
        // mais aucun numéro sénégalais n'a cette longueur.
        $this->postJson('/api/auth/phone/send-otp', ['phone' => '+22178014371'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);

        // Le refus n'a RIEN laissé derrière lui : le contrôleur enregistre le
        // numéro avant d'émettre le code, un refus doit donc précéder les deux.
        $this->assertNull($user->fresh()->phone);
        $this->assertFalse(Cache::has("phone-otp:{$user->id}"));
    }

    /**
     * La borne HAUTE : dix chiffres après +221. Sans l'ancre de fin de la règle
     * `not_regex`, la lookahead ne vérifie que la présence de neuf chiffres, et
     * `+2217801437100` — E.164 valide (13 chiffres) — serait enregistré.
     */
    public function test_send_otp_refuse_un_numero_senegalais_trop_long(): void
    {
        Cache::flush();
        $user = User::factory()->create(['phone' => null, 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/send-otp', ['phone' => '+2217801437100'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);

        $this->assertNull($user->fresh()->phone);
        $this->assertFalse(Cache::has("phone-otp:{$user->id}"));
    }

    public function test_send_otp_enregistre_un_numero_e164_et_envoie_le_code(): void
    {
        Cache::flush();
        $user = User::factory()->create(['phone' => null, 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/send-otp', ['phone' => '+221780143710'])
            ->assertOk()
            ->assertJsonPath('data.sent', true);

        $this->assertSame('+221780143710', $user->fresh()->phone);

        // Un numéro étranger reste accepté : la diaspora n'a pas l'indicatif +221.
        Cache::flush();
        $autre = User::factory()->create(['phone' => null, 'phone_verified_at' => null]);
        Sanctum::actingAs($autre);
        $this->postJson('/api/auth/phone/send-otp', ['phone' => '+33612345678'])->assertOk();
        $this->assertSame('+33612345678', $autre->fresh()->phone);
    }

    /**
     * TCK-574 — `+330612345678` a la forme E.164 (12 chiffres) : la règle de forme seule
     * l'enregistrait, et le code partait vers un numéro qui n'existe pas. Le 0 d'un numéro
     * italien, lui, est un chiffre du numéro.
     */
    public function test_send_otp_refuse_un_zero_de_prefixe_national_apres_l_indicatif(): void
    {
        Cache::flush();
        $user = User::factory()->create(['phone' => null, 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/send-otp', ['phone' => '+330612345678'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone' => __('validation.rules.phone_trunk_prefix')]);

        $this->assertNull($user->fresh()->phone);
        $this->assertFalse(Cache::has("phone-otp:{$user->id}"));

        $this->postJson('/api/auth/phone/send-otp', ['phone' => '+390612345678'])->assertOk();
        $this->assertSame('+390612345678', $user->fresh()->phone);
    }

    /**
     * TCK-574 repair-1 — la page de profil appelle `send-otp` SANS `phone` : le code part au
     * numéro ENREGISTRÉ. Ce numéro-là n'était jamais relu, alors que `UpdateProfileRequest` et
     * `UpdateMeRequest` enregistrent `+330612345678` (forme E.164, 12 chiffres) comme
     * `780143710+221` a pu l'être avant TCK-566. Il est désormais soumis aux mêmes règles que
     * celui qu'on envoie : aucun code ne part vers un numéro qu'aucun réseau n'achemine.
     *
     * @return array<string, array{0: string, 1: string}>
     */
    public static function numerosEnregistresInjoignables(): array
    {
        return [
            'zéro de préfixe national' => ['+330612345678', 'validation.rules.phone_trunk_prefix'],
            'forme corrompue de TCK-566' => ['780143710+221', 'validation.rules.phone_e164'],
            'forme nationale' => ['771234567', 'validation.rules.phone_e164'],
            'sénégalais incomplet' => ['+22178014371', 'validation.rules.phone_e164'],
        ];
    }

    #[DataProvider('numerosEnregistresInjoignables')]
    public function test_send_otp_sans_phone_relit_le_numero_enregistre(string $enregistre, string $message): void
    {
        Cache::flush();
        $user = User::factory()->create(['phone' => $enregistre, 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/send-otp')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone' => __($message)]);

        $this->assertFalse(Cache::has("phone-otp:{$user->id}"), 'aucun code ne doit partir');
        $this->assertSame($enregistre, $user->fresh()->phone, 'le numéro enregistré n\'est pas réécrit');
    }

    /**
     * TCK-574 repair-2 — un `phone` PRÉSENT mais vide ne remplace rien (le contrôleur ne
     * l'enregistre pas) : c'est encore le numéro enregistré qui recevrait le code, et c'est donc
     * lui qui doit être relu. Une garde écrite `has('phone')` au lieu de `filled('phone')` le
     * laissait passer, et rien ne le voyait.
     *
     * @return array<string, array{0: array<string, mixed>}>
     */
    public static function phonesVides(): array
    {
        return [
            'chaîne vide' => [['phone' => '']],
            'null explicite' => [['phone' => null]],
            'espaces seuls' => [['phone' => '   ']],
        ];
    }

    /** @param  array<string, mixed>  $corps */
    #[DataProvider('phonesVides')]
    public function test_send_otp_avec_un_phone_vide_relit_encore_le_numero_enregistre(array $corps): void
    {
        Cache::flush();
        $user = User::factory()->create(['phone' => '+330612345678', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/send-otp', $corps)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone' => __('validation.rules.phone_trunk_prefix')]);

        $this->assertFalse(Cache::has("phone-otp:{$user->id}"), 'aucun code ne doit partir');
        $this->assertSame('+330612345678', $user->fresh()->phone);
    }

    /** Le numéro qu'on envoie remplace l'enregistré : c'est LUI qui est jugé, pas l'ancien. */
    public function test_send_otp_avec_un_numero_valide_remplace_un_enregistre_injoignable(): void
    {
        Cache::flush();
        $user = User::factory()->create(['phone' => '+330612345678', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/send-otp', ['phone' => '+33612345678'])->assertOk();
        $this->assertSame('+33612345678', $user->fresh()->phone);
    }
}
