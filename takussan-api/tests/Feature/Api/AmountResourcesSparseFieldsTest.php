<?php

namespace Tests\Feature\Api;

use App\Http\Resources\AgencyResource;
use App\Http\Resources\BookingResource;
use App\Http\Resources\InvoiceResource;
use App\Http\Resources\LeasePaymentResource;
use App\Http\Resources\PayoutResource;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Invoice;
use App\Models\LeasePayment;
use App\Models\Payout;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-1182 (P100.03) — la règle de `UserResourceSparseFieldsTest` (TCK-1019), étendue aux montants,
 * à la nature et à la devise de cinq ressources.
 *
 * Sous un sparse fieldset qui ne les demande pas, ces colonnes ne sont pas lues : un cast `(float)`
 * ou un repli (`?? 'invoice'`, `?? 'XOF'`) inventait alors une valeur plausible — un avoir rendu
 * comme une facture, un versement à 0 FCFA. `whenHas` omet la clé : *un champ absent se remarque ;
 * un champ faux se croit.*
 */
class AmountResourcesSparseFieldsTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{class-string<Model>, class-string, list<string>}> */
    public static function ressources(): array
    {
        return [
            'facture' => [Invoice::class, InvoiceResource::class, ['kind', 'subtotal', 'total_amount']],
            'versement' => [Payout::class, PayoutResource::class, ['gross_amount', 'commission_amount', 'net_amount']],
            'réservation' => [Booking::class, BookingResource::class, ['total_amount']],
            'agence' => [Agency::class, AgencyResource::class, ['currency']],
            'échéance' => [LeasePayment::class, LeasePaymentResource::class, ['amount', 'paid_amount', 'remaining_amount']],
        ];
    }

    /**
     * @param  class-string<Model>  $modele
     * @param  list<string>  $cles
     */
    #[DataProvider('ressources')]
    public function test_une_colonne_non_lue_n_est_pas_inventee(string $modele, string $ressource, array $cles): void
    {
        // Ce que rend un `select` restreint : l'identifiant et la date, rien d'autre.
        $partiel = (new $modele)->newFromBuilder(['id' => 1, 'created_at' => now()]);

        $ligne = $ressource::make($partiel)->resolve(Request::create('/'));

        foreach ($cles as $cle) {
            $this->assertArrayNotHasKey($cle, $ligne, "`{$cle}` est émis sans que sa colonne ait été lue.");
        }
    }

    /**
     * Le versant positif : le modèle entier, et le modèle tel que `create()` le rend sans `fresh()`
     * (les réponses de création), portent toujours ces clés.
     *
     * @param  class-string<Model>  $modele
     * @param  list<string>  $cles
     */
    #[DataProvider('ressources')]
    public function test_le_modele_entier_et_le_modele_cree_portent_ces_cles(string $modele, string $ressource, array $cles): void
    {
        $cree = $modele::factory()->create();

        foreach ([$cree, $cree->fresh()] as $instance) {
            $ligne = $ressource::make($instance)->resolve(Request::create('/'));
            foreach ($cles as $cle) {
                $this->assertArrayHasKey($cle, $ligne);
            }
        }
    }
}
