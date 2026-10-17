<?php

namespace Tests\Feature\Payments;

use App\Models\Agency;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use ReflectionMethod;
use Tests\TestCase;

/**
 * TCK-778 (P13.07) — la devise d'un paiement sans devise propre est celle de la colonne
 * `agencies.currency`, la seule que valide `AgencyUpdateRequest`. `agencies.settings['currency']`,
 * qu'aucune requête n'écrit, ne l'emporte plus sur elle.
 */
class PaymentCurrencyFromAgencyColumnTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_colonne_de_l_agence_fait_foi_et_non_settings_currency(): void
    {
        $agence = Agency::factory()->create(['currency' => 'XOF', 'settings' => ['currency' => 'eur']]);

        $this->assertSame('XOF', $this->devise($agence));
    }

    public function test_la_colonne_de_l_agence_s_applique_sans_settings(): void
    {
        $agence = Agency::factory()->create(['currency' => 'EUR', 'settings' => null]);

        $this->assertSame('EUR', $this->devise($agence));
    }

    private function devise(Agency $agence): string
    {
        $paiement = new LeasePayment;
        $paiement->setRelation('lease', Lease::factory()->make(['agency_id' => $agence->id]));

        return (new ReflectionMethod(PaymentGatewayService::class, 'paymentCurrency'))
            ->invoke(app(PaymentGatewayService::class), $paiement);
    }
}
