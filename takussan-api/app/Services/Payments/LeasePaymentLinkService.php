<?php

namespace App\Services\Payments;

use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentLinkSubject;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\LeasePaymentLink;
use App\Models\User;
use App\Services\Payments\Dto\PaymentEvent;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * TCK-602 (ADR-0051 §1) — le lien porteur d'une échéance : `/pay/{jeton}`.
 *
 * - `urlFor()` est idempotent : il rend le lien ACTIF et non expiré, ou en émet un (en révoquant
 *   l'expiré) — une relance renvoie le même lien.
 * - `regenerate()` révoque l'actif et en émet un neuf, dans la même transaction : l'ancien rend
 *   410 aussitôt.
 * - `resolve()` est la seule porte d'entrée publique : 404 pour un jeton inconnu, 410 pour un lien
 *   révoqué, expiré, ou dont l'échéance n'est plus payable par nature (supprimée, remboursée,
 *   caution rendue). Une échéance `paid` reste lisible (quittance) 30 jours après son paiement
 *   (voir `effectiveExpiry`).
 *
 * TCK-2778 — un lien a un SUJET (`PaymentLinkSubject`), déduit de l'échéance à l'émission
 * (`subjectFor`) : le loyer dû (pénalité comprise quand l'agence l'encaisse en ligne), ou la
 * pénalité de retard seule, restée due sur un loyer payé. Le lien actif d'un autre sujet est
 * révoqué et remplacé : un lien ne change jamais ce qu'il fait payer.
 */
class LeasePaymentLinkService
{
    /** 32 octets d'un CSPRNG, en base64url sans remplissage : 43 caractères, 256 bits. */
    public const TOKEN_BYTES = 32;

    /** La forme d'un jeton émis ici ; la route la contraint. */
    public const TOKEN_PATTERN = '[A-Za-z0-9_-]{43}';

    /**
     * TCK-1344 (P132.05) — `$locale` : la langue du message qui porte le lien (`/{locale}/pay/…`),
     * pour que la page s'ouvre dans la langue du SMS. Sans elle, le front choisit.
     */
    /**
     * TCK-2778 — `$subject` : ce que le lien doit faire payer, que seul l'émetteur de l'agence passe
     * (`LeasePaymentLinkController`, d'après `subjectFor`) ; il est rejugé sous verrou. Sans lui, le
     * lien du loyer, comme avant le ticket : la quittance d'une échéance payée et la relance
     * automatique le demandent ainsi.
     */
    public function urlFor(LeasePayment $payment, ?User $by = null, ?string $locale = null, ?PaymentLinkSubject $subject = null): string
    {
        return $this->url($this->tokenFor($payment, $by, false, $subject), $locale);
    }

    public function regenerate(LeasePayment $payment, ?User $by = null, ?PaymentLinkSubject $subject = null): string
    {
        return $this->url($this->tokenFor($payment, $by, true, $subject));
    }

    /** Révoque le lien actif, s'il y en a un. Rend `true` si un lien a été révoqué. */
    public function revoke(LeasePayment $payment): bool
    {
        return LeasePaymentLink::query()
            ->where('lease_payment_id', $payment->getKey())
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now(), 'updated_at' => now()]) > 0;
    }

    /** Le lien actif d'une échéance, sans en émettre (relecture par l'agence). */
    public function active(LeasePayment $payment): ?LeasePaymentLink
    {
        return LeasePaymentLink::query()
            ->where('lease_payment_id', $payment->getKey())
            ->whereNull('revoked_at')
            ->first();
    }

    /**
     * Le lien que désigne `$token`, et son échéance chargée. 404 si inconnu ; 410
     * (`pay_link.gone`, qui nomme l'agence) s'il ne sert plus.
     */
    /**
     * TCK-2504 — `$readSettled` : la LECTURE de la page (`show`) d'une échéance remboursée. Elle
     * rend son état et `paid_at` au lieu de 410 ; payer, vérifier et relire la quittance la
     * refusent toujours (TCK-593). Révocation, suppression, caution rendue, annulation et
     * expiration restent 410 pour tous.
     */
    public function resolve(string $token, bool $readSettled = false): LeasePaymentLink
    {
        $hash = LeasePaymentLink::hashToken($token);
        $link = LeasePaymentLink::query()->where('token_hash', $hash)->first();
        abort_code_if($link === null || ! hash_equals((string) $link->token_hash, $hash), 404, 'pay_link.not_found');

        $payment = $link->leasePayment()->with(['lease.agency', 'lease.property.address'])->first();
        $agency = (string) ($payment?->lease?->agency?->name ?? '');

        abort_code_if($this->isGone($link, $payment, $readSettled), 410, 'pay_link.gone', ['agency' => $agency]);

        $link->setRelation('leasePayment', $payment);

        return $link;
    }

    /**
     * TCK-1346 (P132.04) — le lien de ce jeton haché sert-il encore ? Les règles de `resolve()`,
     * sans lever ni compter de lecture : un SMS reporté à la fin de la nuit le relit avant de partir.
     */
    public function isLive(string $tokenHash): bool
    {
        $link = LeasePaymentLink::query()->where('token_hash', $tokenHash)->first();
        if ($link === null) {
            return false;
        }
        $payment = $link->leasePayment()->with('lease')->first();

        return ! $this->isGone($link, $payment);
    }

    /** Une lecture publique du lien : compteur et date, jamais le jeton. */
    public function touch(LeasePaymentLink $link): void
    {
        LeasePaymentLink::query()->whereKey($link->getKey())->update([
            'last_accessed_at' => now(),
            'access_count' => DB::raw('access_count + 1'),
        ]);
    }

    /**
     * L'échéance effective du lien : ramenée à 30 jours après le paiement une fois l'échéance
     * payée. TCK-1342 (P132.01) — « après le paiement », c'est le plus tardif de `paid_at` (date
     * effective, que l'agence peut saisir dans le passé) et de `marked_paid_at` (l'enregistrement).
     *
     * TCK-2504 (revue) — une échéance REMBOURSÉE, lisible depuis TCK-2504, tombe de même 30 jours
     * après le remboursement (la réception de l'événement `refunded` du fournisseur), ou après le
     * paiement si le remboursement n'a pas de date : sans cela, elle restait lisible jusqu'à
     * l'expiration d'origine du lien, plus longtemps qu'une échéance payée.
     */
    public function effectiveExpiry(LeasePaymentLink $link, ?LeasePayment $payment): CarbonImmutable
    {
        $expires = CarbonImmutable::parse($link->expires_at);
        $settledAt = match (true) {
            $payment === null => null,
            // TCK-2778 — un lien de pénalité naît sur un loyer DÉJÀ payé : sa lecture se compte depuis
            // le règlement de la pénalité, jamais depuis celui du loyer (il serait caduc à sa
            // naissance, le loyer payé depuis plus de 30 jours).
            $payment->status === PaymentStatus::Paid && $link->isForLateFee() => $payment->late_fee_paid_at !== null
                ? CarbonImmutable::parse($payment->late_fee_paid_at)
                : null,
            $payment->status === PaymentStatus::Paid => $this->paidAt($payment),
            $this->isRefundedInstalment($payment) => $this->refundedAt($payment) ?? $this->paidAt($payment),
            default => null,
        };
        if ($settledAt !== null) {
            $receiptEnd = $settledAt->addDays((int) config('payments.pay_link.receipt_days', 30));
            if ($receiptEnd->lt($expires)) {
                return $receiptEnd;
            }
        }

        return $expires;
    }

    /** Le plus tardif de `paid_at` et de `marked_paid_at` ; `null` sans `paid_at`. */
    private function paidAt(LeasePayment $payment): ?CarbonImmutable
    {
        if ($payment->paid_at === null) {
            return null;
        }
        $paidAt = CarbonImmutable::parse($payment->paid_at);
        if ($payment->marked_paid_at !== null && CarbonImmutable::parse($payment->marked_paid_at)->gt($paidAt)) {
            $paidAt = CarbonImmutable::parse($payment->marked_paid_at);
        }

        return $paidAt;
    }

    /** La réception du dernier événement `refunded` du fournisseur (`metadata.gateway_events`). */
    private function refundedAt(LeasePayment $payment): ?CarbonImmutable
    {
        $events = is_array($payment->metadata['gateway_events'] ?? null) ? $payment->metadata['gateway_events'] : [];
        $at = null;
        foreach ($events as $event) {
            if (($event['type'] ?? null) === PaymentEvent::TYPE_REFUNDED && is_string($event['received_at'] ?? null)) {
                $candidate = CarbonImmutable::parse($event['received_at']);
                $at = $at === null || $candidate->gt($at) ? $candidate : $at;
            }
        }

        return $at;
    }

    private function isGone(LeasePaymentLink $link, ?LeasePayment $payment, bool $readSettled = false): bool
    {
        if ($link->revoked_at !== null || $payment === null || $payment->trashed() || $payment->lease === null) {
            return true;
        }
        // TCK-594 — une caution rendue n'est pas une somme que le locataire règle ; TCK-596, une
        // échéance annulée par un renouvellement non plus — voir `isPayableByNature`.
        // TCK-2504 — une échéance remboursée reste LISIBLE quand on le demande (`$readSettled`).
        if (! $this->isPayableByNature($payment) && ! ($readSettled && $this->isRefundedInstalment($payment))) {
            return true;
        }

        return $this->effectiveExpiry($link, $payment)->isPast();
    }

    /** TCK-2504 — une échéance (pas une caution rendue) que le fournisseur a remboursée. */
    private function isRefundedInstalment(LeasePayment $payment): bool
    {
        return $payment->status === PaymentStatus::Refunded && $payment->payment_type !== LeasePaymentType::DepositRefund;
    }

    /**
     * Ce qu'aucune action ne rendra payable : supprimée, remboursée, caution rendue, annulée.
     * (`paid` n'en est pas : la page reste lisible pour la quittance.)
     */
    /**
     * TCK-2778 — ce qu'un lien émis maintenant ferait payer : le loyer s'il est dû
     * (`PaymentGatewayService::isPayable`), la pénalité seule si elle reste due sur un loyer payé
     * (`LeasePayment::lateFeeAloneOutstanding`), rien sinon (`null`). Ne juge pas si l'agence
     * encaisse ses pénalités en ligne : c'est le refus propre du contrôleur.
     */
    public function subjectFor(LeasePayment $payment): ?PaymentLinkSubject
    {
        if (! $this->isPayableByNature($payment)) {
            return null;
        }

        return match (true) {
            app(PaymentGatewayService::class)->isPayable($payment) => PaymentLinkSubject::Rent,
            $payment->lateFeeAloneOutstanding() => PaymentLinkSubject::LateFee,
            default => null,
        };
    }

    public function isPayableByNature(LeasePayment $payment): bool
    {
        if ($payment->payment_type === LeasePaymentType::DepositRefund) {
            return false;
        }

        return ! in_array($payment->status, [PaymentStatus::Refunded, PaymentStatus::Cancelled], true);
    }

    private function tokenFor(LeasePayment $payment, ?User $by, bool $fresh, ?PaymentLinkSubject $requested = null): string
    {
        return DB::transaction(function () use ($payment, $by, $fresh, $requested): string {
            // Sérialise deux émissions simultanées sur la même échéance (la ligne parent, comme
            // le veut le piège PostgreSQL n°2) : l'index partiel n'en laisserait passer qu'une, et
            // la seconde lèverait au lieu de rendre le lien de la première.
            $locked = LeasePayment::query()->withTrashed()->whereKey($payment->getKey())->lockForUpdate()->firstOrFail();

            // TCK-2778 — le sujet demandé se rejuge sur la ligne verrouillée : un paiement reçu entre
            // le contrôleur et ici change ce que le lien ferait payer.
            $subject = $requested ?? PaymentLinkSubject::Rent;
            abort_code_if($requested !== null && $this->subjectFor($locked) !== $requested, 409, 'payment.not_payable');

            $active = $this->active($payment);
            // Un lien actif d'un AUTRE sujet (le lien du loyer, émis pendant le retard, sur un loyer
            // payé depuis) est révoqué, jamais réaffecté : le SMS déjà envoyé ne fait pas payer
            // autre chose que ce qu'il annonçait.
            $sameSubject = ($active?->subject ?? PaymentLinkSubject::Rent) === $subject;
            if ($active !== null && ! $fresh && $sameSubject && $this->effectiveExpiry($active, $locked)->isFuture()) {
                return (string) $active->token;
            }
            if ($active !== null) {
                $active->forceFill(['revoked_at' => now()])->save();
            }

            $token = rtrim(strtr(base64_encode(random_bytes(self::TOKEN_BYTES)), '+/', '-_'), '=');
            $due = $payment->due_date !== null ? CarbonImmutable::parse($payment->due_date) : CarbonImmutable::today();
            $base = $due->gt(CarbonImmutable::today()) ? $due : CarbonImmutable::today();

            LeasePaymentLink::query()->create([
                'lease_payment_id' => $payment->getKey(),
                'token_hash' => LeasePaymentLink::hashToken($token),
                'token' => $token,
                'expires_at' => $base->addDays((int) config('payments.pay_link.ttl_days_after_due', 60))->endOfDay(),
                'created_by_id' => $by?->getKey(),
                'subject' => $subject,
            ]);

            return $token;
        });
    }

    /** Les langues de la surface publique du front (`takussan-web/src/i18n/config.ts`). */
    private const LOCALES = ['fr', 'en', 'wo'];

    private function url(string $token, ?string $locale = null): string
    {
        $prefix = in_array($locale, self::LOCALES, true) ? '/'.$locale : '';

        return rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/').$prefix.'/pay/'.$token;
    }

    /** L'URL de retour du fournisseur : la page du lien, jamais une URL fournie par la requête. */
    public function returnUrl(string $token, string $status): string
    {
        return $this->url($token).'?status='.rawurlencode($status);
    }
}
