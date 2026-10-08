<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeSmsRouter;
use Tests\Support\ReadsPhoneCodes;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse m5 — un numéro vérifié HÉRITÉ hors E.164 (la forme corrompue
 * `780143710+221` de TCK-566 a été enregistrée et vérifiée sur une base déployée) est retrouvé
 * et protégé comme sa forme E.164 : l'entrée par téléphone reconnecte SON compte, la
 * vérification par un autre compte rend 409, et l'index d'unicité voit le doublon.
 *
 * Rouge sur f8321498 : le titulaire obtenait un SECOND compte, et l'index comparait la chaîne
 * brute.
 */
class LegacyPhoneFormTest extends TestCase
{
    use ReadsPhoneCodes, RefreshDatabase;

    private const E164 = '+221780143710';

    private const CORROMPU = '780143710+221';

    private FakeSmsRouter $sms;

    private User $titulaire;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->sms = FakeSmsRouter::install();
        $this->titulaire = User::factory()->create(['phone' => self::CORROMPU, 'phone_verified_at' => now()]);
    }

    public function test_l_entree_par_telephone_reconnecte_le_compte_herite(): void
    {
        $this->postJson('/api/auth/phone/request-code', ['phone' => self::E164])->assertStatus(202);
        $code = $this->sms->lastCodeFor(self::E164);

        $this->postJson('/api/auth/phone/verify-code', ['phone' => self::E164, 'code' => $code])
            ->assertOk()
            ->assertJsonPath('is_new_account', false)
            ->assertJsonPath('user.id', $this->titulaire->id);

        $this->assertSame(1, User::query()->count());
    }

    public function test_un_autre_compte_ne_verifie_pas_la_forme_e164_du_numero_herite(): void
    {
        $autre = User::factory()->create(['phone' => self::E164, 'phone_verified_at' => null]);
        $code = $this->issuePhoneCode($autre);
        Sanctum::actingAs($autre);

        $this->postJson('/api/auth/phone/verify-otp', ['code' => $code])
            ->assertStatus(409)
            ->assertJsonPath('code', 'phone.taken');
        $this->assertNull($autre->fresh()->phone_verified_at);
    }

    public function test_l_index_d_unicite_compare_la_forme_normalisee(): void
    {
        $autre = User::factory()->create(['phone' => '+221 78 014 37 10', 'phone_verified_at' => null]);

        $refus = null;
        try {
            // Un point de sauvegarde : l'échec attendu n'abandonne pas la transaction du test.
            DB::transaction(fn () => $autre->forceFill(['phone_verified_at' => now()])->save());
        } catch (QueryException $e) {
            $refus = $e;
        }

        $this->assertNotNull($refus, "L'index a laissé vérifier deux fois le même numéro sous deux écritures.");
        $this->assertSame('23505', $refus->getCode());
        $this->assertNull($autre->fresh()->phone_verified_at);
    }
}
