<?php

namespace App\Services\Payments;

use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\LeasePaymentLink;
use App\Models\User;
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
 *   caution rendue). Une échéance `paid` reste lisible (quittance) jusqu'à `paid_at` + 30 jours.
 */
class LeasePaymentLinkService
{
    /** 32 octets d'un CSPRNG, en base64url sans remplissage : 43 caractères, 256 bits. */
    public const TOKEN_BYTES = 32;

    /** La forme d'un jeton émis ici ; la route la contraint. */
    public const TOKEN_PATTERN = '[A-Za-z0-9_-]{43}';

    public function urlFor(LeasePayment $payment, ?User $by = null): string
    {
        return $this->url($this->tokenFor($payment, $by, false));
    }

    public function regenerate(LeasePayment $payment, ?User $by = null): string
    {
        return $this->url($this->tokenFor($payment, $by, true));
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
    public function resolve(string $token): LeasePaymentLink
    {
        $hash = LeasePaymentLink::hashToken($token);
        $link = LeasePaymentLink::query()->where('token_hash', $hash)->first();
        abort_code_if($link === null || ! hash_equals((string) $link->token_hash, $hash), 404, 'pay_link.not_found');

        $payment = $link->leasePayment()->with(['lease.agency', 'lease.property.address'])->first();
        $agency = (string) ($payment?->lease?->agency?->name ?? '');

        abort_code_if($this->isGone($link, $payment), 410, 'pay_link.gone', ['agency' => $agency]);

        $link->setRelation('leasePayment', $payment);

        return $link;
    }

    /** Une lecture publique du lien : compteur et date, jamais le jeton. */
    public function touch(LeasePaymentLink $link): void
    {
        LeasePaymentLink::query()->whereKey($link->getKey())->update([
            'last_accessed_at' => now(),
            'access_count' => DB::raw('access_count + 1'),
        ]);
    }

    /** L'échéance effective du lien : ramenée à `paid_at` + 30 jours une fois l'échéance payée. */
    public function effectiveExpiry(LeasePaymentLink $link, ?LeasePayment $payment): CarbonImmutable
    {
        $expires = CarbonImmutable::parse($link->expires_at);
        if ($payment?->status === PaymentStatus::Paid && $payment->paid_at !== null) {
            $receiptEnd = CarbonImmutable::parse($payment->paid_at)->addDays((int) config('payments.pay_link.receipt_days', 30));
            if ($receiptEnd->lt($expires)) {
                return $receiptEnd;
            }
        }

        return $expires;
    }

    private function isGone(LeasePaymentLink $link, ?LeasePayment $payment): bool
    {
        if ($link->revoked_at !== null || $payment === null || $payment->trashed() || $payment->lease === null) {
            return true;
        }
        // TCK-594 — une caution rendue n'est pas une somme que le locataire règle ; TCK-596, une
        // échéance annulée par un renouvellement non plus — voir `isPayableByNature`.
        if (! $this->isPayableByNature($payment)) {
            return true;
        }

        return $this->effectiveExpiry($link, $payment)->isPast();
    }

    /**
     * Ce qu'aucune action ne rendra payable : supprimée, remboursée, caution rendue, annulée.
     * (`paid` n'en est pas : la page reste lisible pour la quittance.)
     */
    public function isPayableByNature(LeasePayment $payment): bool
    {
        if ($payment->payment_type === LeasePaymentType::DepositRefund) {
            return false;
        }

        return ! in_array($payment->status, [PaymentStatus::Refunded, PaymentStatus::Cancelled], true);
    }

    private function tokenFor(LeasePayment $payment, ?User $by, bool $fresh): string
    {
        return DB::transaction(function () use ($payment, $by, $fresh): string {
            // Sérialise deux émissions simultanées sur la même échéance (la ligne parent, comme
            // le veut le piège PostgreSQL n°2) : l'index partiel n'en laisserait passer qu'une, et
            // la seconde lèverait au lieu de rendre le lien de la première.
            LeasePayment::query()->withTrashed()->whereKey($payment->getKey())->lockForUpdate()->firstOrFail();

            $active = $this->active($payment);
            if ($active !== null && ! $fresh && $this->effectiveExpiry($active, $payment)->isFuture()) {
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
            ]);

            return $token;
        });
    }

    private function url(string $token): string
    {
        return rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/').'/pay/'.$token;
    }

    /** L'URL de retour du fournisseur : la page du lien, jamais une URL fournie par la requête. */
    public function returnUrl(string $token, string $status): string
    {
        return $this->url($token).'?status='.rawurlencode($status);
    }
}
