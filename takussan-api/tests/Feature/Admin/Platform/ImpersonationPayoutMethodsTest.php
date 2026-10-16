<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\PayoutMethod;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-714 (P03.04, ADR-0055) — sous impersonation, `GET /api/me/payout-methods` rend
 * `account_identifier` masqué (les quatre derniers caractères), jamais en clair.
 *
 * Versant autorisé : la cible, sous son propre jeton, lit toujours la forme claire. Sans lui, un
 * masquage appliqué à tout le monde rendrait le test vert.
 */
class ImpersonationPayoutMethodsTest extends TestCase
{
    use RefreshDatabase;
    use SessionsDImpersonation;

    private const NUMBER = '+221 77 123 45 67';

    public function test_l_identifiant_de_versement_est_masque_sous_impersonation(): void
    {
        $cible = User::factory()->create();
        PayoutMethod::factory()->create([
            'user_id' => $cible->id,
            'account_identifier' => self::NUMBER,
            'masked_identifier' => PayoutMethod::mask(self::NUMBER),
        ]);

        // Versant autorisé : la cible lit la forme claire sous son propre jeton.
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($cible->fresh());
        $this->getJson('/api/me/payout-methods')
            ->assertOk()
            ->assertJsonPath('data.0.account_identifier', self::NUMBER);

        $session = $this->ouvrirUneSession(cible: $cible);
        $this->avecLeJeton($session['jeton']);

        $reponse = $this->getJson('/api/me/payout-methods')->assertOk();
        $reponse->assertJsonPath('data.0.account_identifier', '•••• 4567')
            ->assertJsonPath('data.0.masked_identifier', '•••• 4567');
        $this->assertStringNotContainsString('1234567', $reponse->getContent());
        $this->assertStringNotContainsString('123 45 67', $reponse->getContent());
    }
}
