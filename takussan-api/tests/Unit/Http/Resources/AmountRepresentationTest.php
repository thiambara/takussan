<?php

namespace Tests\Unit\Http\Resources;

use App\Http\Resources\Api\Admin\PlatformPayoutResource;
use App\Http\Resources\BookingPaymentResource;
use App\Http\Resources\BookingResource;
use App\Http\Resources\InvoiceResource;
use App\Http\Resources\LeasePaymentResource;
use App\Http\Resources\LeaseResource;
use App\Http\Resources\MaintenanceRequestResource;
use App\Http\Resources\PayoutResource;
use App\Http\Resources\PropertyResource;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Payout;
use App\Models\PlatformPayout;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-308 AC2 — **aucun montant exposé par l'API n'a changé de représentation.**
 *
 * Le ticket a migré 36 ressources de `JsonResource` vers `BaseResource`, et c'est le montant
 * qui rendait l'opération risquée : *le montant est décimal en base, entier ×100 à la frontière
 * du driver de paiement* (principe non négociable n°3), XOF n'ayant pas de sous-unité. Une
 * conversion refaite à la main sur un montant est un bug d'argent, et c'est la conversion la
 * plus facile à casser sans qu'un test s'en aperçoive : `120000` et `12000000` sont tous deux
 * des nombres plausibles dans une réponse JSON.
 *
 * **Deux choses protègent ce point, et elles ne se valent pas.**
 *
 * La première est structurelle et vaut pour le passé : la migration a été un ÉCHANGE DE PARENT,
 * rien d'autre — 72 insertions et 72 suppressions sur 36 fichiers, deux lignes chacun, aucun
 * corps de `toArray()` touché. Et `BaseResource` n'offre AUCUN helper de montant : il ne peut
 * donc pas en changer la représentation, même par mégarde. C'est une preuve par construction, et
 * elle est plus forte qu'un test — mais elle ne protège que ce commit-ci.
 *
 * La seconde est ce fichier, et elle vaut pour l'avenir : elle fige la représentation elle-même.
 * Un montant sort en **`float`, à sa valeur décimale de base, sans ×100**. Le jour où quelqu'un
 * « harmonisera » un montant en centimes ou en chaîne formatée pour l'affichage — les deux
 * tentations réelles — ce test rougit, et il nomme le champ.
 *
 * ⚠ Il ne couvre PAS les libellés ni les devises : le front possède le texte affiché
 * (principe n°5), et le formatage monétaire lui appartient.
 */
class AmountRepresentationTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Chaque cas : la ressource, le modèle, et les couples `clé JSON => attribut du modèle`.
     *
     * La liste est écrite à la main et c'est assumé : elle n'énumère pas « les ressources », elle
     * énumère **les champs d'argent**, qui ne se dérivent d'aucun motif fiable (`total_floors` et
     * `views_count` ressemblent à des montants pour un grep, `subtotal` n'y ressemble pas). Une
     * garde dérivée serait ici moins juste qu'une liste courte et lue.
     *
     * @return array<string, array{0: class-string, 1: class-string, 2: array<string,string>}>
     */
    public static function montantsExposes(): array
    {
        return [
            'BookingPayment' => [BookingPaymentResource::class, BookingPayment::class, [
                'amount' => 'amount',
            ]],
            'LeasePayment' => [LeasePaymentResource::class, LeasePayment::class, [
                'amount' => 'amount',
            ]],
            'Invoice' => [InvoiceResource::class, Invoice::class, [
                'subtotal' => 'subtotal',
                'total_amount' => 'total_amount',
            ]],
            'Payout' => [PayoutResource::class, Payout::class, [
                'gross_amount' => 'gross_amount',
                'commission_amount' => 'commission_amount',
                'net_amount' => 'net_amount',
            ]],
            'PlatformPayout' => [PlatformPayoutResource::class, PlatformPayout::class, [
                'gross_amount' => 'gross_amount',
                'platform_fee_amount' => 'platform_fee_amount',
                'net_amount' => 'net_amount',
            ]],
            'Booking' => [BookingResource::class, Booking::class, [
                'total_amount' => 'total_amount',
            ]],
            'Property' => [PropertyResource::class, Property::class, [
                'price' => 'price',
            ]],
        ];
    }

    /**
     * @param  class-string  $resourceClass
     * @param  class-string  $modelClass
     * @param  array<string,string>  $champs
     */
    #[DataProvider('montantsExposes')]
    public function test_un_montant_sort_en_float_a_sa_valeur_decimale(
        string $resourceClass,
        string $modelClass,
        array $champs,
    ): void {
        $model = $modelClass::factory()->create();
        $sortie = (new $resourceClass($model))->toArray(Request::create('/', 'GET'));

        foreach ($champs as $cle => $attribut) {
            $this->assertArrayHasKey($cle, $sortie, "{$resourceClass} n'expose plus « {$cle} »");

            $attendu = (float) $model->{$attribut};

            $this->assertIsFloat(
                $sortie[$cle],
                "{$resourceClass}::{$cle} doit sortir en float — ni chaîne formatée, ni entier de centimes",
            );

            $this->assertSame(
                $attendu,
                $sortie[$cle],
                "{$resourceClass}::{$cle} a changé de représentation : la base porte {$model->{$attribut}}",
            );
        }
    }

    /**
     * Le cas nommé du principe n°3, isolé parce qu'il est le plus cher et le plus tentant :
     * ×100 est ce que fait la frontière du driver de paiement, et c'est exactement ce qu'une
     * ressource ne doit PAS faire. XOF n'a pas de sous-unité — un montant multiplié par cent
     * dans une réponse d'API est un ordre de grandeur d'erreur qui se lit comme une valeur
     * plausible.
     */
    public function test_aucun_montant_nest_multiplie_par_cent_a_la_frontiere_de_lapi(): void
    {
        $payment = LeasePayment::factory()->create(['amount' => 150000]);

        $sortie = (new LeasePaymentResource($payment))->toArray(Request::create('/', 'GET'));

        $this->assertSame(150000.0, $sortie['amount']);
        $this->assertNotSame(15000000.0, $sortie['amount'], 'le ×100 du driver de paiement a fuité dans la ressource');
    }

    /**
     * Un montant nullable reste `null`, il ne devient pas `0.0`. La nuance porte du sens métier :
     * « pas de frais de retard » et « frais de retard nuls » ne se lisent pas pareil côté front,
     * et le cast `(float) null` vaut `0.0` — la faute est à un caractère près.
     */
    public function test_un_montant_nul_reste_null_et_ne_devient_pas_zero(): void
    {
        $payment = LeasePayment::factory()->create(['late_fee_amount' => null]);

        $sortie = (new LeasePaymentResource($payment))->toArray(Request::create('/', 'GET'));

        $this->assertArrayHasKey('late_fee_amount', $sortie);
        $this->assertNull($sortie['late_fee_amount']);
    }

    /**
     * Les coûts de maintenance et le loyer d'un bail passent par la même forme null-gardée. Ils
     * sont ici et non dans le fournisseur ci-dessus parce que leurs factories ne garantissent pas
     * une valeur non nulle : on la pose.
     */
    public function test_les_montants_null_gardes_conservent_leur_forme(): void
    {
        $lease = Lease::factory()->create(['monthly_rent' => 250000, 'deposit_amount' => null]);
        $sortie = (new LeaseResource($lease))->toArray(Request::create('/', 'GET'));

        $this->assertSame(250000.0, $sortie['monthly_rent']);
        $this->assertNull($sortie['deposit_amount']);

        $demande = MaintenanceRequest::factory()->create(['estimated_cost' => 45000, 'actual_cost' => null]);
        $sortie = (new MaintenanceRequestResource($demande))->toArray(Request::create('/', 'GET'));

        $this->assertSame(45000.0, $sortie['estimated_cost']);
        $this->assertNull($sortie['actual_cost']);
    }
}
