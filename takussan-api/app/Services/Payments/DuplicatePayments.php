<?php

namespace App\Services\Payments;

use Illuminate\Support\Carbon;

/**
 * TCK-608 — LA lecture des doublons d'encaissement d'un payable (`metadata.gateway_duplicate_payment`),
 * une fois, pour la page de retour (`PaymentGatewayController::verify`), la ressource d'une échéance et
 * le geste « Doublon remboursé ».
 *
 * Un doublon est un règlement qui a débité le payeur sans rien solder (échéance annulée, déjà réglée,
 * remboursée — V3, M-E, TCK-872), ou la part « pénalité » d'un règlement qui a soldé le loyer après que
 * la pénalité a été réglée à l'agence (`kind: late_fee`). Il est « à rembourser » tant que son entrée ne
 * porte pas `refunded_at` — posé par le webhook de remboursement du fournisseur (TCK-871), ou par le
 * geste du personnel ({@see self::markAllRefunded()}).
 *
 * Avant TCK-608, `refund_pending` n'était vrai que pour un doublon inscrit sous LA transaction que
 * `verify` interrogeait, et sur une réponse du fournisseur : deux checkouts (N2), intégration coupée (N3)
 * ou Lemon Squeezy (doublon inscrit sous l'id de commande, N4) le laissaient faux, et la page disait
 * « réessayez » à un locataire débité. Et il ne retombait jamais.
 */
final class DuplicatePayments
{
    public const KIND_LATE_FEE = 'late_fee';

    /** Un doublon du règlement lui-même (hors part pénalité) attend son remboursement. */
    public static function refundPending(mixed $metadata): bool
    {
        foreach (self::entries($metadata) as $entry) {
            if (($entry['kind'] ?? null) !== self::KIND_LATE_FEE && ! isset($entry['refunded_at'])) {
                return true;
            }
        }

        return false;
    }

    /** La part pénalité encaissée deux fois attend son remboursement (« une part vous sera remboursée »). */
    public static function lateFeeRefundPending(mixed $metadata): bool
    {
        foreach (self::entries($metadata) as $entry) {
            if (($entry['kind'] ?? null) === self::KIND_LATE_FEE && ! isset($entry['refunded_at'])) {
                return true;
            }
        }

        return false;
    }

    /** Un doublon, de quelque nature, reste à rembourser : ce que le geste « Doublon remboursé » éteint. */
    public static function anyRefundPending(mixed $metadata): bool
    {
        return self::refundPending($metadata) || self::lateFeeRefundPending($metadata);
    }

    /**
     * Pose `refunded_at` sur chaque doublon qui ne le porte pas, part pénalité comprise (le webhook du
     * fournisseur ne note que la transaction remboursée ; le geste manuel constate tout ce que l'agence a
     * rendu). Rend la metadata réécrite et le nombre d'entrées marquées.
     *
     * @param  array<string,mixed>  $metadata
     * @return array{0: array<string,mixed>, 1: int}
     */
    public static function markAllRefunded(array $metadata, \DateTimeInterface $at): array
    {
        // Même forme que le webhook du fournisseur pose dans la metadata (ISO 8601, `+00:00`).
        $at = Carbon::instance($at)->toIso8601String();
        $marked = 0;
        if (! is_array($metadata['gateway_duplicate_payment'] ?? null)) {
            return [$metadata, 0];
        }

        foreach ($metadata['gateway_duplicate_payment'] as $i => $entry) {
            if (is_array($entry) && ! isset($entry['refunded_at'])) {
                $metadata['gateway_duplicate_payment'][$i]['refunded_at'] = $at;
                $marked++;
            }
        }

        return [$metadata, $marked];
    }

    /** @return list<array<string,mixed>> */
    private static function entries(mixed $metadata): array
    {
        $duplicates = is_array($metadata) ? ($metadata['gateway_duplicate_payment'] ?? []) : [];

        return array_values(array_filter(is_array($duplicates) ? $duplicates : [], 'is_array'));
    }
}
