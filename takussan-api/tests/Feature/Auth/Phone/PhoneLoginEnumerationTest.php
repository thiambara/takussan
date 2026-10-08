<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use App\Services\Auth\LoginLock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-589 AC3 — `request-code` ne dit rien de l'existence d'un compte : même statut,
 * même corps, avec ou sans compte, verrouillé ou non, dans le délai de renvoi ou non.
 */
class PhoneLoginEnumerationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        $this->withoutMiddleware(ThrottleRequests::class);
        FakeSmsRouter::install();
    }

    public function test_la_reponse_est_identique_avec_et_sans_compte(): void
    {
        User::factory()->create(['phone' => '+221770000301', 'phone_verified_at' => now()]);
        $verrouille = User::factory()->create(['phone' => '+221770000303', 'phone_verified_at' => now()]);
        for ($i = 0; $i < LoginLock::MAX_FAILURES; $i++) {
            app(LoginLock::class)->recordFailure($verrouille);
        }

        $avecCompte = $this->postJson('/api/auth/phone/request-code', ['phone' => '+221770000301']);
        $sansCompte = $this->postJson('/api/auth/phone/request-code', ['phone' => '+221770000302']);
        $bloque = $this->postJson('/api/auth/phone/request-code', ['phone' => '+221770000303']);
        $renvoiTropTot = $this->postJson('/api/auth/phone/request-code', ['phone' => '+221770000302']);

        foreach ([$avecCompte, $sansCompte, $bloque, $renvoiTropTot] as $reponse) {
            $reponse->assertStatus(202);
            $this->assertSame($avecCompte->json(), $reponse->json());
        }
    }
}
