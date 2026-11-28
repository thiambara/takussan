<?php

namespace App\Services\Model;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Lease\GestesDuBail;
use App\Services\Messaging\FilDeLObjet;
use App\Services\Notifications\ContactSansCompte;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Notifications\Sms\DeferredSmsGuard;
use App\Services\Payments\LeasePaymentLinkService;
use App\Services\Payments\PaymentGatewayService;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class LeasePaymentService
{
    public function __construct(
        protected NotificationService $notifications,
        private readonly LeasePaymentLinkService $links,
    ) {}

    /**
     * @param  array<string,mixed>  $data
     */
    public function create(Lease $lease, User $user, array $data): LeasePayment
    {
        // Preserve caller-provided status when explicit; default to pending.
        $status = $data['status'] ?? PaymentStatus::Pending->value;

        return DB::transaction(function () use ($lease, $user, $data, $status): LeasePayment {
            // TCK-3011 — P46.04 se rejuge sur la ligne du bail verrouillée : sur le modèle lié à la route, une
            // résiliation validée entre la lecture et l'écriture laissait poser une ligne sur un bail fini.
            // `for no key update`, comme le renouvellement : il ne heurte pas le `KEY SHARE` qu'un webhook pose
            // sur le bail en écrivant l'une de ses échéances.
            $locked = Lease::query()->whereKey($lease->getKey())->lock('for no key update')->firstOrFail();
            abort_code_unless(GestesDuBail::ligneAjoutable($locked), 422, 'lease_payment.lease_not_active');

            return $locked->payments()->create(array_merge($data, [
                'reference_number' => ReferenceNumberGenerator::leasePayment(),
                'payer_id' => $locked->tenant_id,
                'collector_id' => $user->id,
                'currency' => $locked->currency?->value ?? 'XOF',
                'status' => $status instanceof PaymentStatus ? $status->value : $status,
            ]));
        });
    }

    /**
     * @param  array<string,mixed>  $data
     */
    public function markPaid(LeasePayment $payment, array $data = [], ?User $by = null): LeasePayment
    {
        // VERIF-596 passe 6 (M-G) — relue SOUS VERROU et jugée sur la ligne, comme
        // `LateFeeSettlement::markPaid`. Sur l'instance liée par la route, une échéance qu'un
        // renouvellement venait d'annuler (`cancelled`) était réécrite `paid` : l'`UPDATE` attendait
        // le verrou du renouvellement puis passait, la matrice jugeant sur l'original `pending`.
        $payment = DB::transaction(function () use ($payment, $data, $by): LeasePayment {
            /** @var LeasePayment $locked */
            $locked = LeasePayment::query()->whereKey($payment->getKey())->lockForUpdate()->firstOrFail();

            // TCK-594 (VERIF-594 passe 4, P4-7) — la ligne d'une caution rendue se règle par son
            // reversement (`PayoutService::markProcessed`), jamais à la main : marquée payée, le refus
            // de la restitution la laissait `paid`, et la restitution suivante en créait une seconde.
            abort_code_if(
                $locked->payment_type === LeasePaymentType::DepositRefund,
                422,
                'lease_payment.deposit_refund_paid_by_payout'
            );

            abort_code_if($locked->status === PaymentStatus::Cancelled, 409, 'lease_payment.cancelled');
            // TCK-608 (décision du porteur du 2026-11-16, option (b)) — aucune voie ne crée plus de
            // `partially_paid` (TCK-1918) ; une ligne héritée se solde ici, au reste dû.
            abort_code_unless(
                in_array($locked->status, [PaymentStatus::Pending, PaymentStatus::Late, PaymentStatus::PartiallyPaid], true),
                422,
                'lease_payment.cannot_mark_paid'
            );

            // TCK-593 (vérification adverse, V3) — un règlement manuel pendant qu'un checkout est
            // ouvert ferait encaisser l'échéance deux fois : refusé tant que le checkout vit.
            $gateway = app(PaymentGatewayService::class);
            // Passe 2, M5 — le personnel peut passer outre, motif à l'appui (la requête en réserve le
            // droit au personnel de l'agence) : le checkout écarté, payé quand même, sera un doublon
            // signalé (V3).
            $overridden = null;
            if (! empty($data['override_open_checkout'])) {
                $overridden = $gateway->supersedeOpenCheckout($locked, (string) ($data['override_reason'] ?? ''));
            } else {
                $gateway->assertNoOpenCheckout($locked);
            }
            $gateway->markManualSettlement($locked);

            // TCK-608 — soldée, la ligne a reçu son montant entier : la part versée d'une `partially_paid`
            // héritée, laissée telle quelle, ferait lire à l'accesseur d'une ligne `paid` le seul acompte
            // (`metadata.paid_amount > 0`), et un reste dû. Relevée seulement : un trop-versé reste dit
            // tel quel (l'accesseur ne rabote jamais un surplus).
            $metadata = $locked->metadata;
            if (is_array($metadata) && array_key_exists('paid_amount', $metadata)) {
                $metadata['paid_amount'] = max((float) $metadata['paid_amount'], (float) $locked->amount);
            }

            $locked->update([
                'status' => PaymentStatus::Paid,
                'metadata' => $metadata,
                'paid_at' => $data['paid_at'] ?? now(),
                // TCK-1342 (P132.01) — le moment de l'enregistrement : la quittance reste lisible
                // 30 jours après lui, même si la date effective saisie est plus ancienne.
                'marked_paid_at' => now(),
                'payment_method' => $data['payment_method'] ?? $locked->payment_method,
                'transaction_id' => $data['transaction_id'] ?? $locked->transaction_id,
            ]);

            $locked->refresh();

            if ($overridden !== null) {
                $gateway->logCheckoutOverride($locked, $by, $overridden, 'mark_paid');
            }

            return $locked;
        });

        // TCK-2961 (ADR-0128 § 3) — le paiement à la main parle dans la salle du bail, comme le paiement
        // en ligne (`EcritLePaiementEnLigneDansLeFil`) : payé, puis la quittance, servie dès qu'il l'est.
        self::parlerDuPaiement($payment);

        // Notify tenant and landlord — TCK-588 : le reçu du bailleur nomme le bien et le locataire.
        $lease = $payment->lease;
        if ($lease) {
            $lease->loadMissing(['property', 'tenant.user', 'landlord']);
            $tenantUser = $lease->tenant?->user;
            $landlord = $lease->landlord;
            $amount = NotificationRenderer::money($payment->amount, $payment->currency);
            $target = NotificationTarget::of('lease', $lease->id);

            $params = ['amount' => $amount, 'property' => $lease->property?->title];
            if ($tenantUser) {
                // TCK-1002 — un compte lit sa quittance dans son espace : ni lien porteur, ni
                // canal mobile (le code n'est mobile que pour un contact sans compte).
                $this->notifications->send($tenantUser, NotificationCode::LeasePaymentRecorded, $params, $target, mobileBorne: false);
            } elseif ($lease->tenant !== null && ($contact = ContactSansCompte::fromCustomer($lease->tenant))->hasPhone()) {
                // TCK-1002 (P48.02) — le locataire sans compte reçoit le lien `/pay/{jeton}` de sa
                // quittance, comme après un paiement en ligne (`SendRentReceiptAfterOnlinePayment`).
                $url = $this->links->urlFor($payment, locale: $contact->locale);
                // TCK-1346 (P132.04) — reporté à la nuit, le SMS relit son lien avant de partir.
                $this->notifications->send($contact, NotificationCode::LeasePaymentRecorded, $params + ['receipt_url' => $url], $target, deferredSmsGuard: DeferredSmsGuard::forPayLink($url));
            } else {
                Log::info('[pay-link] paiement enregistré non notifié — locataire sans compte ni téléphone valide', [
                    'lease_payment_id' => $payment->id,
                ]);
            }
            if ($landlord) {
                $this->notifications->send($landlord, NotificationCode::LeasePaymentReceivedLandlord, [
                    'amount' => $amount,
                    'property' => $lease->property?->title,
                    'tenant' => trim(($lease->tenant?->first_name ?? '').' '.($lease->tenant?->last_name ?? '')),
                ], $target);
            }
        }

        return $payment;
    }

    /**
     * TCK-2961 — `lease_payment.paid` (le CODE du moyen, jamais un numéro) puis
     * `lease_payment.receipt_issued`, dans la salle du bail : les deux chemins du paiement (à la main,
     * en ligne) passent par ici. Aucun geste attendu.
     */
    public static function parlerDuPaiement(LeasePayment $payment): void
    {
        $fil = app(FilDeLObjet::class);
        $methode = $payment->payment_method instanceof \BackedEnum ? $payment->payment_method->value : $payment->payment_method;
        $fil->parler($payment, 'lease_payment.paid', ['method' => $methode]);
        $fil->parler($payment, 'lease_payment.receipt_issued');
    }

    /**
     * TCK-2961 — le geste « payer » d'une échéance : le compte du locataire de son bail, et lui seul.
     *
     * @return Closure(User): bool
     */
    public static function locataireDe(LeasePayment $payment): Closure
    {
        $locataire = Lease::query()->whereKey($payment->lease_id)->first()?->tenant()->value('user_id');

        return fn (User $participant): bool => $locataire !== null && (int) $participant->getKey() === (int) $locataire;
    }
}
