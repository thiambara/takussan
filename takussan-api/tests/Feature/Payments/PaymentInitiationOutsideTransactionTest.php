<?php

namespace Tests\Feature\Payments;

use App\Exceptions\ApiError;
use App\Models\Enums\PaymentProvider;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeWave;
use Tests\Support\LeaseDueFixture;
use Tests\Support\ReleveSqlParTransaction;
use Tests\TestCase;

/**
 * P65.02 (TCK-1075) — l'initiation d'un paiement en trois temps.
 *
 * L'appel au fournisseur (35 s au pire chez Orange Money, 60 s chez Lemon Squeezy) avait lieu dans
 * la transaction, sous le verrou de la ligne : la connexion restait ouverte, et le webhook comme la
 * vérification du même paiement attendaient. Désormais : réserver sous verrou (avec échéance),
 * appeler le fournisseur hors transaction, puis enregistrer sous verrou en revérifiant, comme
 * `verify()`.
 *
 * `RefreshDatabase` ouvre sa propre transaction : « hors transaction » se mesure donc par le niveau
 * de transaction pendant l'appel, comparé à celui d'avant la requête.
 */
class PaymentInitiationOutsideTransactionTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase, ReleveSqlParTransaction;

    /**
     * Wave, derrière le client HTTP ({@see FakeWave}) : le vrai pilote est appelé, et `$pendant` s'exécute
     * pendant l'appel (ce qui arrive pendant la latence), une seule fois. TCK-3014 (ADR-0140 § 5) — le
     * pilote n'est plus une doublure partielle de `PaymentGatewayService::driverFor`.
     *
     * @param  (\Closure(LeasePayment): void)|null  $pendant
     */
    private function wave(?\Closure $pendant = null): FakeWave
    {
        return FakeWave::install('txn_')->pendantLeCheckout(function (int $paymentId) use (&$pendant): void {
            if ($pendant !== null) {
                $rappel = $pendant;
                $pendant = null;
                $rappel(LeasePayment::query()->findOrFail($paymentId));
            }
        });
    }

    private function initiate(int $paymentId)
    {
        return $this->postJson("/api/lease-payments/{$paymentId}/initiate", ['provider' => 'wave']);
    }

    public function test_le_fournisseur_est_appele_hors_de_la_transaction(): void
    {
        $ctx = $this->leaseDue();
        $niveaux = [];
        $this->wave()->pendantLeCheckout(function () use (&$niveaux): void {
            $niveaux[] = DB::transactionLevel();
        });
        Sanctum::actingAs($ctx['tenant']);
        $base = DB::transactionLevel();

        $this->initiate($ctx['payment']->id)->assertOk()->assertJsonPath('data.transaction_id', 'txn_1');

        $this->assertSame([$base], $niveaux, 'Le fournisseur est appelé dans la transaction de l\'initiation.');
        $gateway = $ctx['payment']->refresh()->metadata['gateway'];
        $this->assertSame('txn_1', $gateway['transaction_id']);
        $this->assertArrayNotHasKey('initiating', $gateway, 'La réservation survit à l\'enregistrement.');
    }

    /**
     * TCK-619 (verif-593, V2) — chacun des deux temps sous verrou d'`initiateWith` relit le paiement
     * `FOR UPDATE` DANS la transaction qui écrit ensuite : la réservation (`metadata.gateway.initiating`),
     * puis l'enregistrement du `transaction_id`. Un verrou absent, ou pris hors de la transaction qui
     * écrit (au niveau du test, ou dans une transaction déjà refermée), rougit ce test. Le SQL réel est
     * relevé avec l'identité de la transaction qui le porte ({@see ReleveSqlParTransaction}).
     */
    public function test_chaque_temps_ecrit_sous_le_verrou_de_sa_propre_transaction(): void
    {
        $ctx = $this->leaseDue();
        $this->wave();
        Sanctum::actingAs($ctx['tenant']);
        $id = $ctx['payment']->id;
        $base = DB::transactionLevel();
        $releve = $this->releverSqlParTransaction();

        $this->initiate($id)->assertOk()->assertJsonPath('data.transaction_id', 'txn_1');

        $requetes = $releve->getArrayCopy();
        $ecriture = function (string $marque) use ($requetes, $id): int {
            foreach ($requetes as $i => $q) {
                if (preg_match('/^update "lease_payments" set /i', $q['sql']) && in_array($id, $q['bindings'], true)
                    && str_contains(implode(' ', array_map(fn ($b) => is_scalar($b) ? (string) $b : '', $q['bindings'])), $marque)) {
                    return $i;
                }
            }
            $this->fail("initiate : aucune écriture du paiement ne porte « {$marque} »");
        };
        $verrouAvant = function (int $i) use ($requetes, $id): ?array {
            for ($j = $i - 1; $j >= 0; $j--) {
                $q = $requetes[$j];
                if (preg_match('/from "lease_payments" .*for update/i', $q['sql']) && in_array($id, $q['bindings'], true)) {
                    return $q;
                }
            }

            return null;
        };

        $temps = [];
        foreach (['réservation' => 'initiating', 'enregistrement' => 'txn_1'] as $nom => $marque) {
            $i = $ecriture($marque);
            $verrou = $verrouAvant($i);
            $this->assertNotNull($verrou, "initiate ({$nom}) : le paiement n'est pas relu FOR UPDATE avant l'écriture");
            $this->assertGreaterThan($base, $verrou['level'], "initiate ({$nom}) : le FOR UPDATE n'est tenu par aucune transaction du code");
            $this->assertSame($requetes[$i]['tx'], $verrou['tx'], "initiate ({$nom}) : le verrou n'est pas tenu par la transaction qui écrit");
            $temps[$nom] = $requetes[$i]['tx'];
        }
        $this->assertNotSame($temps['réservation'], $temps['enregistrement'], 'initiate : réservation et enregistrement dans la même transaction');
    }

    public function test_pendant_l_appel_la_ligne_porte_la_reservation_et_une_seconde_initiation_est_refusee(): void
    {
        $ctx = $this->leaseDue();
        $seen = [];
        $wave = $this->wave(function (LeasePayment $payment) use (&$seen): void {
            $seen['initiating'] = LeasePayment::query()->findOrFail($payment->getKey())->metadata['gateway']['initiating'] ?? null;
            try {
                app(PaymentGatewayService::class)->initiate(LeasePayment::query()->findOrFail($payment->getKey()), PaymentProvider::Wave);
                $seen['second'] = 'accepted';
            } catch (ApiError $e) {
                $seen['second'] = $e->getStatusCode().' '.$e->errorCode;
                $seen['checkout'] = $e->extra['checkout'] ?? null;
            }
        });
        Sanctum::actingAs($ctx['tenant']);

        $this->initiate($ctx['payment']->id)->assertOk()->assertJsonPath('data.transaction_id', 'txn_1');

        $this->assertSame(1, $wave->appels, 'Une seconde initiation pendant l\'appel a ouvert un second checkout.');
        $this->assertSame('409 payment.checkout_in_progress', $seen['second']);
        $this->assertSame('wave', $seen['initiating']['provider'] ?? null);
        $this->assertEqualsWithDelta(150_000, $seen['checkout']['amount'] ?? null, 0.001);
        $this->assertNotEmpty($seen['initiating']['expires_at'] ?? null);
    }

    public function test_un_paiement_regle_pendant_l_appel_n_enregistre_pas_le_checkout(): void
    {
        $ctx = $this->leaseDue();
        $this->wave(function (LeasePayment $payment): void {
            LeasePayment::query()->whereKey($payment->getKey())->update(['status' => PaymentStatus::Paid->value, 'paid_at' => now()]);
        });
        Sanctum::actingAs($ctx['tenant']);

        $this->initiate($ctx['payment']->id)->assertStatus(409)->assertJsonPath('code', 'payment.not_payable');

        $payment = $ctx['payment']->refresh();
        $this->assertNotSame('txn_1', $payment->transaction_id, 'Le checkout d\'un paiement réglé entre-temps a été enregistré.');
        $this->assertArrayNotHasKey('initiating', $payment->metadata['gateway'] ?? []);
    }

    public function test_un_echec_du_fournisseur_libere_la_reservation(): void
    {
        $ctx = $this->leaseDue();
        $wave = $this->wave()->echouerLeProchainCheckout();
        Sanctum::actingAs($ctx['tenant']);

        $this->initiate($ctx['payment']->id)->assertStatus(502)->assertJsonPath('code', 'payment.provider_unavailable');
        $this->assertArrayNotHasKey('initiating', $ctx['payment']->refresh()->metadata['gateway'] ?? []);

        $this->initiate($ctx['payment']->id)->assertOk()->assertJsonPath('data.transaction_id', 'txn_2');
        $this->assertSame(2, $wave->appels);
    }

    public function test_une_reservation_echue_ne_bloque_plus(): void
    {
        $ctx = $this->leaseDue();
        $wave = $this->wave();
        $meta = $ctx['payment']->metadata ?? [];
        $meta['gateway'] = ['initiating' => [
            'provider' => 'wave',
            'amount' => 157_500,
            'reserved_at' => now()->subMinutes(10)->toIso8601String(),
            'expires_at' => now()->subMinutes(8)->toIso8601String(),
            'token' => 'ancien',
        ]];
        $ctx['payment']->forceFill(['metadata' => $meta])->saveQuietly();
        Sanctum::actingAs($ctx['tenant']);

        $this->initiate($ctx['payment']->id)->assertOk()->assertJsonPath('data.transaction_id', 'txn_1');
        $this->assertSame(1, $wave->appels);
    }
}
