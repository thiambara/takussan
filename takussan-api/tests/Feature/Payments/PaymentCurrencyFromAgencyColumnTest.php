<?php

namespace Tests\Feature\Payments;

use App\Models\Agency;
use App\Models\Enums\PaymentProvider;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-778 (P13.07) — la devise d'un paiement sans devise propre est celle de la colonne
 * `agencies.currency`, la seule que valide `AgencyUpdateRequest`. `agencies.settings['currency']`,
 * qu'aucune requête n'écrit, ne l'emporte plus sur elle.
 *
 * TCK-3014 (ADR-0140 § 5) — lue par ce qu'elle décide en public : les fournisseurs offerts au
 * paiement (`availableProviders()`), Wave pour le franc CFA, Lemon Squeezy pour l'euro — plus par
 * réflexion sur `paymentCurrency()`.
 */
class PaymentCurrencyFromAgencyColumnTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_colonne_de_l_agence_fait_foi_et_non_settings_currency(): void
    {
        $agence = Agency::factory()->create(['currency' => 'XOF', 'settings' => ['currency' => 'eur']]);

        $this->assertSame([PaymentProvider::Wave], $this->fournisseurs($agence));
    }

    public function test_la_colonne_de_l_agence_s_applique_sans_settings(): void
    {
        $agence = Agency::factory()->create(['currency' => 'EUR', 'settings' => null]);

        $this->assertSame([PaymentProvider::LemonSqueezy], $this->fournisseurs($agence));
    }

    /** @return list<PaymentProvider> */
    private function fournisseurs(Agency $agence): array
    {
        // Un fournisseur par devise : Wave ne sert que le franc CFA, Lemon Squeezy jamais lui.
        foreach ([PaymentProvider::Wave, PaymentProvider::LemonSqueezy] as $fournisseur) {
            $pilote = PaymentGatewayService::DRIVERS[$fournisseur->value];
            Integration::factory()->create([
                'agency_id' => $agence->id,
                'provider' => $fournisseur->value,
                'is_active' => true,
                'credentials' => array_fill_keys($pilote::CREDENTIAL_KEYS, 'x'),
            ]);
        }

        $paiement = new LeasePayment;
        $paiement->setRelation('lease', Lease::factory()->make(['agency_id' => $agence->id]));

        return app(PaymentGatewayService::class)->availableProviders($paiement);
    }
}
