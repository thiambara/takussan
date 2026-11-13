<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\InitiatePaymentRequest;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\PaymentProvider;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Payments\PaymentGatewayService;
use BackedEnum;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Initiate a checkout session and (optionally) force-verify a payment.
 * Routes are wired with both `payment_type` polymorphic resolution and
 * the dedicated booking-/lease-payment binding.
 */
class PaymentGatewayController extends Controller
{
    public function __construct(protected PaymentGatewayService $gateway) {}

    public function initiate(InitiatePaymentRequest $request, string $paymentType, int $paymentId): JsonResponse
    {
        $payment = $this->resolvePayment($paymentType, $paymentId);
        // TCK-306 — le `instanceof` sur trois types est devenu trois policies ;
        // Laravel choisit celle qui s'applique sur la classe reelle du paiement.
        abort_if($request->user() === null, 401);
        $this->authorize('update', $payment);

        $provider = PaymentProvider::from($request->validated()['provider']);

        $session = $this->gateway->initiate($payment, $provider, [
            'return_url' => $request->validated()['return_url'] ?? null,
            'cancel_url' => $request->validated()['cancel_url'] ?? null,
        ]);

        return $this->json([
            'data' => [
                'checkout_url' => $session->checkoutUrl,
                'transaction_id' => $session->transactionId,
                'provider' => $session->provider,
            ],
        ]);
    }

    public function verify(Request $request, string $paymentType, int $paymentId): JsonResponse
    {
        $payment = $this->resolvePayment($paymentType, $paymentId);
        abort_if($request->user() === null, 401);
        $this->authorize('update', $payment);

        $status = $this->gateway->verify($payment);
        $payment->refresh();

        return $this->json([
            'data' => [
                'status' => $payment->status->value ?? null,
                'provider_status' => $status?->status,
                'transaction_id' => $payment->transaction_id,
                'refund_pending' => $status !== null && $this->isRefundPending($payment, $status->transactionId),
                // TCK-2650 — ce que la page de retour nomme, lu en base : elle ne croit plus l'adresse.
                'payment' => $this->paiementVerifie($payment),
            ],
        ]);
    }

    /**
     * TCK-2650 — le paiement tel que la page de retour le nomme (`PaiementVerifie` côté front), LU EN
     * BASE après la vérification : le montant de la ligne, celui du dernier checkout, sa devise, sa nature, sa référence, le code
     * du fournisseur du dernier checkout (un code hors de {@see PaymentProvider} n'est pas rendu) et la
     * date de paiement. Le bail et sa période pour une échéance de loyer SEULEMENT : la carte en tire
     * « Loyer de décembre 2026 » et le lien de la quittance. Le statut serveur reste `data.status`.
     *
     * Liste fermée, délibérément : ni `metadata` (le fournisseur y laisse le numéro du payeur), ni payeur,
     * ni téléphone, ni adresse.
     *
     * @return array<string, mixed>
     */
    private function paiementVerifie(Model $payment): array
    {
        $gateway = is_array($payment->metadata ?? null) && is_array($payment->metadata['gateway'] ?? null) ? $payment->metadata['gateway'] : [];
        $fournisseur = is_string($gateway['provider'] ?? null) ? PaymentProvider::tryFrom($gateway['provider']) : null;
        $montant = $payment->getAttribute($payment instanceof Invoice ? 'total_amount' : 'amount');
        $attendu = is_array($payment->metadata ?? null) ? ($payment->metadata['gateway_expected_amount'] ?? null) : null;
        $paidAt = $payment->getAttribute('paid_at');

        $bloc = [
            'amount' => is_numeric($montant) ? (float) $montant : null,
            // Le montant FIGÉ du dernier checkout émis (TCK-593, `recordInitiation()`), pénalité encaissée
            // en ligne comprise : ce que le fournisseur débite. `null` sans checkout (saisie à l'agence).
            'checkout_amount' => is_numeric($attendu) ? (float) $attendu : null,
            // Décision du porteur 6a (2026-11-13) — « dont pénalité de retard » : la part de pénalité FIGÉE
            // de ce même checkout (`gateway.transactions[*].late_fee_amount`), `null` sans checkout.
            'checkout_late_fee_amount' => is_numeric($attendu) ? self::penaliteDuCheckout($gateway, $payment->getAttribute('transaction_id')) : null,
            'currency' => self::valeur($payment->getAttribute('currency')),
            'payment_type' => $payment instanceof Invoice ? null : self::valeur($payment->getAttribute('payment_type')),
            'reference_number' => $payment->getAttribute('reference_number'),
            'provider' => $fournisseur?->value,
            'paid_at' => $this->instant($paidAt instanceof DateTimeInterface ? $paidAt : null),
        ];

        if ($payment instanceof LeasePayment) {
            $bloc += [
                'lease_id' => $payment->lease_id,
                'period_start' => $this->calendarDate($payment->period_start),
                'period_end' => $this->calendarDate($payment->period_end),
            ];
        }

        return $bloc;
    }

    /**
     * La part de pénalité du checkout courant : l'entrée de `gateway.transactions` du `transaction_id`
     * de la ligne (la dernière émise à défaut), `0.0` si elle n'en porte pas.
     *
     * @param  array<string, mixed>  $gateway
     */
    private static function penaliteDuCheckout(array $gateway, mixed $transactionId): float
    {
        $transactions = array_values(array_filter(is_array($gateway['transactions'] ?? null) ? $gateway['transactions'] : [], 'is_array'));
        // TCK-2778 — le repli prend la dernière entrée du LOYER : un checkout de la pénalité seule
        // (`subject: late_fee`) n'est pas le checkout de cette ligne.
        $duLoyer = array_values(array_filter($transactions, fn (array $t): bool => ($t['subject'] ?? null) !== PaymentGatewayService::SUBJECT_LATE_FEE));
        $courante = collect($transactions)->last(fn (array $t): bool => ($t['transaction_id'] ?? null) === $transactionId) ?? end($duLoyer);

        return is_array($courante) && is_numeric($courante['late_fee_amount'] ?? null) ? (float) $courante['late_fee_amount'] : 0.0;
    }

    private static function valeur(mixed $valeur): mixed
    {
        return $valeur instanceof BackedEnum ? $valeur->value : $valeur;
    }

    /**
     * TCK-602 (ADR-0051 §3) — les fournisseurs que CE paiement peut utiliser : une intégration active
     * couvre son agence (repli global compris), un pilote la sert, ses identifiants sont remplis, et
     * le fournisseur accepte la devise. Même autorisation que l'initiation : le locataire qui paie la
     * lit, sans accès à `GET /api/integrations` (réservé à l'admin d'agence). Aucun appel sortant.
     */
    public function providers(Request $request, string $paymentType, int $paymentId): JsonResponse
    {
        $payment = $this->resolvePayment($paymentType, $paymentId);
        abort_if($request->user() === null, 401);
        $this->authorize('update', $payment);

        return $this->json([
            'data' => [
                'providers' => array_map(
                    static fn (PaymentProvider $provider): string => $provider->value,
                    $this->gateway->availableProviders($payment),
                ),
            ],
        ]);
    }

    /**
     * VERIF-596 passe 8 (m-o) — le règlement vérifié a débité le payeur sans rien solder (échéance
     * annulée par un renouvellement, ou déjà réglée) : il est inscrit en doublon, et l'agence doit
     * le rembourser. La part « pénalité » d'un règlement qui a soldé le loyer (`kind: late_fee`)
     * n'en fait pas un règlement à rembourser.
     */
    private function isRefundPending(Model $payment, string $transactionId): bool
    {
        $duplicates = is_array($payment->metadata ?? null) ? ($payment->metadata['gateway_duplicate_payment'] ?? []) : [];

        return collect(is_array($duplicates) ? $duplicates : [])->contains(
            fn ($entry): bool => is_array($entry)
                && ($entry['transaction_id'] ?? null) === $transactionId
                && ($entry['kind'] ?? null) !== 'late_fee',
        );
    }

    protected function resolvePayment(string $type, int $id): Model
    {
        $model = match ($type) {
            'booking-payments' => BookingPayment::query()->findOrFail($id),
            'lease-payments' => LeasePayment::query()->findOrFail($id),
            'invoices' => Invoice::query()->findOrFail($id),
            default => abort_code(404, 'payment.type_unknown'),
        };

        return $model;
    }
}
