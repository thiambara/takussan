<?php

namespace Tests\Feature\Auth\Phone;

use App\Events\Auth\PhoneVerified;
use App\Exceptions\ApiError;
use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ReadsPhoneCodes;
use Tests\TestCase;

/**
 * TCK-633 (lot C, interface C → F) — `PhoneVerified` part du seul écrivain de
 * `phone_verified_at` (`PhoneVerificationService::markVerified`), une fois par vérification réelle.
 */
class PhoneVerifiedEventTest extends TestCase
{
    use ReadsPhoneCodes, RefreshDatabase;

    public function test_la_verification_du_numero_principal_annonce_phone_verified_une_fois(): void
    {
        Cache::flush();
        Event::fake([PhoneVerified::class]);
        $user = User::factory()->create(['phone' => '+221770000555', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);
        $code = $this->issuePhoneCode($user);

        $this->postJson('/api/auth/phone/verify-otp', ['code' => $code])->assertOk();

        Event::assertDispatchedTimes(PhoneVerified::class, 1);
        Event::assertDispatched(PhoneVerified::class, fn (PhoneVerified $e) => $e->user->is($user));

        // Le même numéro, déjà vérifié : `markVerified` sort tôt, rien de plus n'est annoncé.
        app(PhoneVerificationService::class)->markVerified($user->fresh(), '+221770000555');
        Event::assertDispatchedTimes(PhoneVerified::class, 1);
    }

    /** Un numéro déjà vérifié ailleurs : 409, et aucune annonce. */
    public function test_un_refus_n_annonce_rien(): void
    {
        Event::fake([PhoneVerified::class]);
        User::factory()->create(['phone' => '+221770000556', 'phone_verified_at' => now()]);
        $user = User::factory()->create(['phone' => null, 'phone_verified_at' => null]);

        try {
            app(PhoneVerificationService::class)->markVerified($user, '+221770000556');
            $this->fail('409 attendu');
        } catch (ApiError $e) {
            $this->assertSame(409, $e->getStatusCode());
            $this->assertSame('phone.taken', $e->errorCode);
        }

        Event::assertNotDispatched(PhoneVerified::class);
    }
}
