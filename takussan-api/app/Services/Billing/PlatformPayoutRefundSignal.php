<?php

namespace App\Services\Billing;

use App\Events\Payments\PlatformPayoutLineRefunded;
use App\Models\BookingPayment;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\LeasePayment;
use App\Models\PlatformPayout;
use Carbon\CarbonInterface;

/**
 * TCK-2320 (P39.07, porteur 2026-10-25) — un reversement de la plateforme déjà `paid` qui porte une
 * ligne remboursée depuis est SIGNALÉ, sans écrire de montant : la ligne est notée dans
 * `metadata.refunded_since_paid` (type, identifiant, référence, date), que la console super-admin
 * lit, et l'agence en est avisée. Le reversement garde ses montants : la compensation sur le
 * prochain reversement n'est pas décidée.
 *
 * Avant `paid`, rien n'est noté : l'approbation et le paiement refusent déjà un reversement dont
 * une ligne a changé (`platform_payout.items_changed`, TCK-1156, TCK-1214).
 */
final class PlatformPayoutRefundSignal
{
    public const METADATA_KEY = 'refunded_since_paid';

    /**
     * À appeler DANS la transaction qui écrit le remboursement, après la ligne de la pièce. Une
     * ligne n'est notée qu'une fois, même remboursée en plusieurs parts.
     */
    public function record(LeasePayment|BookingPayment $payment, CarbonInterface $at): void
    {
        if ($payment->platform_payout_id === null) {
            return;
        }

        $payout = PlatformPayout::query()->whereKey($payment->platform_payout_id)->lockForUpdate()->first();
        if ($payout === null || $payout->status !== PlatformPayoutStatus::Paid) {
            return;
        }

        $type = $payment instanceof LeasePayment ? 'lease_payment' : 'booking_payment';
        $entries = self::of($payout);
        foreach ($entries as $entry) {
            if ($entry['payment_type'] === $type && $entry['payment_id'] === (int) $payment->getKey()) {
                return;
            }
        }

        $reference = (string) ($payment->reference_number ?? '#'.$payment->getKey());
        $entries[] = [
            'payment_type' => $type,
            'payment_id' => (int) $payment->getKey(),
            'reference_number' => $reference,
            'refunded_at' => $at->toIso8601String(),
        ];
        $payout->forceFill(['metadata' => array_merge(is_array($payout->metadata) ? $payout->metadata : [], [self::METADATA_KEY => $entries])])->save();

        event(new PlatformPayoutLineRefunded((int) $payout->id, $reference));
    }

    /**
     * Les lignes remboursées depuis le paiement du reversement, dans l'ordre où elles l'ont été.
     *
     * @return list<array{payment_type: string, payment_id: int, reference_number: string, refunded_at: string}>
     */
    public static function of(PlatformPayout $payout): array
    {
        $entries = is_array($payout->metadata) ? ($payout->metadata[self::METADATA_KEY] ?? []) : [];

        // `jsonb` range les clés à sa façon : chaque entrée est rendue dans un ordre fixe.
        return is_array($entries) ? array_values(array_map(fn (array $entry): array => [
            'payment_type' => (string) ($entry['payment_type'] ?? ''),
            'payment_id' => (int) ($entry['payment_id'] ?? 0),
            'reference_number' => (string) ($entry['reference_number'] ?? ''),
            'refunded_at' => (string) ($entry['refunded_at'] ?? ''),
        ], array_filter($entries, 'is_array'))) : [];
    }
}
