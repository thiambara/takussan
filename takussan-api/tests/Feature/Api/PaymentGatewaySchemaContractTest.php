<?php

namespace Tests\Feature\Api;

use App\Models\BookingPayment;
use App\Models\Invoice;
use App\Models\LeasePayment;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Le contrat de schéma que `PaymentGatewayService` SUPPOSE de chaque payable — et que la
 * suite ne pouvait pas vérifier autrement.
 *
 * ## Pourquoi ce fichier existe
 *
 * `PaymentGatewayService::paymentsForEvent()` boucle sur les trois payables et interroge
 * chacun par `transaction_id` à chaque webhook entrant. `invoices` n'avait pas cette
 * colonne. Sur **MySQL 8.0** — le moteur de production, mesuré — la requête lève
 * `SQLSTATE[42S22] Unknown column`. La boucle étant enveloppée dans `DB::transaction()`,
 * le paiement de réservation ou de loyer trouvé aux deux premiers tours était ANNULÉ par le
 * rollback : **aucun paiement, d'aucun type, ne pouvait être confirmé en production.**
 *
 * Sur **SQLite** — le moteur des tests — la même requête ne lève pas : elle rend 0 ligne
 * **en silence**. Mesuré le 2026-08-16. Les 2 294 tests étaient donc verts pendant que la
 * passerelle était morte, et aucun test supplémentaire du chemin de paiement n'y aurait rien
 * changé : le défaut n'est pas dans ce que la suite teste, il est dans ce que son moteur
 * PARDONNE.
 *
 * ## Pourquoi cette forme
 *
 * Rejouer la suite entière sur MySQL fermerait la classe entière de ces défauts, mais coûte
 * un second moteur et le double du temps en CI. Ce test prend le chemin étroit : il ne
 * REQUÊTE pas les colonnes, il vérifie qu'elles EXISTENT — ce que SQLite sait dire aussi
 * bien que MySQL.
 *
 * ⚠️ **Il est honnête sur sa portée.** Il ne couvre que les colonnes énumérées ci-dessous,
 * tenues à la main. Il ne dérive rien du code du service : une requête neuve sur une colonne
 * neuve lui échappera jusqu'à ce que quelqu'un l'ajoute ici. C'est un cliquet, pas une
 * preuve — et le déclarer vaut mieux que de laisser croire l'inverse (dette D-23).
 *
 * Ardoise D-51 · TCK-285.
 */
class PaymentGatewaySchemaContractTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Les colonnes que le service lit ou écrit sur TOUT payable, avec le point d'appel qui
     * l'exige. Ajouter une ligne ici est le geste qui accompagne une requête neuve.
     *
     * @return array<string, array{class-string<Model>, string, string}>
     */
    public static function payableColumns(): array
    {
        $cases = [];

        foreach ([
            BookingPayment::class => 'booking_payments',
            LeasePayment::class => 'lease_payments',
            Invoice::class => 'invoices',
        ] as $class => $table) {
            $short = class_basename($class);

            // `paymentsForEvent()` : `$class::where('transaction_id', $event->transactionId)`
            // — exécuté pour les TROIS classes à chaque webhook, quel que soit le payable
            // réellement concerné. C'est la colonne dont l'absence cassait tout.
            $cases["$short.transaction_id"] = [$class, $table, 'transaction_id'];

            // `recordInitiation()` écrit l'empreinte de la session de paiement ici.
            $cases["$short.metadata"] = [$class, $table, 'metadata'];

            // `paymentCurrency()` la lit avant de vérifier que le fournisseur supporte la
            // devise ; son absence ferait retomber toute facture sur le défaut XOF sans le
            // dire.
            $cases["$short.currency"] = [$class, $table, 'currency'];
        }

        return $cases;
    }

    /**
     * @param  class-string<Model>  $class
     */
    #[DataProvider('payableColumns')]
    public function test_every_payable_carries_the_columns_the_gateway_queries(
        string $class,
        string $table,
        string $column,
    ): void {
        $this->assertTrue(
            Schema::hasColumn($table, $column),
            "`$table` n'a pas de colonne `$column`, que PaymentGatewayService interroge sur "
            .'tout payable. Sur SQLite la requête rendra 0 ligne en silence ; sur MySQL 8.0 '
            .'elle lèvera `Unknown column` et fera échouer le webhook — donc en production, '
            .'et seulement là.',
        );

        $this->assertContains(
            $column,
            (new $class)->getFillable(),
            "`$column` existe en base sur `$table` mais n'est pas `fillable` sur $class : "
            .'`recordInitiation()` l\'écrit par `fill()`, qui l\'ignorerait en silence.',
        );
    }

    /**
     * Le pendant applicatif : chaque payable doit savoir dire combien il vaut.
     *
     * `Invoice` porte `total_amount` là où les deux autres portent `amount`. Un
     * `$payment->amount` nu y rend `null`, que `(float)` transforme en `0.0` — et
     * `initiate()` rendait donc 422 « montant non positif » sur TOUTE facture, un message
     * qui accuse la donnée alors que le défaut est dans la lecture.
     */
    public function test_every_payable_resolves_a_positive_amount(): void
    {
        $payables = [
            BookingPayment::factory()->create(['amount' => 15000]),
            LeasePayment::factory()->create(['amount' => 15000]),
            Invoice::factory()->create(['total_amount' => 15000]),
        ];

        $resolve = new \ReflectionMethod(
            PaymentGatewayService::class,
            'paymentAmount',
        );

        $gateway = app(PaymentGatewayService::class);

        foreach ($payables as $payable) {
            $amount = $resolve->invoke($gateway, $payable);

            $this->assertNotNull(
                $amount,
                $payable::class.' : aucun montant résolu. `initiate()` rendrait 422.',
            );
            $this->assertSame(
                15000.0,
                $amount,
                $payable::class.' : montant résolu incorrect — la colonne lue n\'est pas la bonne.',
            );
        }
    }
}
