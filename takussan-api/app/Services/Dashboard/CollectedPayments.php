<?php

namespace App\Services\Dashboard;

use App\Models\BookingPayment;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-595 (ADR-0057 §2) — LA définition de l'*Encaissé* et de l'*Impayé*, une fois, pour tous les
 * lecteurs : tableaux de bord bailleur, agence et client, balance âgée, métriques et instantanés
 * plateforme.
 *
 * - *Encaissé* = `LeasePayment` payés de type `rent | charges | regularization | penalty`, plus
 *   `BookingPayment` `paid`, chacun pour montant − `refund_amount`. Jamais `deposit` (de l'argent
 *   détenu, pas un revenu) ni `deposit_refund` (de l'argent qui SORT vers le locataire, TCK-594).
 *   TCK-1214 (P76.02, option (b) du porteur) : seul un remboursement total passe une ligne à
 *   `refunded` ; un partiel la laisse `paid` avec son `refund_amount`, que les deux côtés soustraient
 *   ({@see self::LEASE_NET_SQL}, {@see self::BOOKING_NET_SQL}).
 * - *Impayé* = `LeasePayment` `pending | partially_paid | late` échus, hors `deposit_refund`, quel que
 *   soit le statut `late` ou non : un bail sans pénalité ne passe jamais `late` (`LateFeeCalculator`).
 *   Il se compte au RESTE DÛ ({@see self::OWED_REMAINING_SQL}), pas au montant facial.
 *
 * - *Encaissé*, second agrégat (P206.02, ADR-0057, amendement du 2026-10-24, point 1) : la
 *   pénalité de retard réglée, datée par `late_fee_paid_at` et non par `paid_at`
 *   ({@see self::lateFeeIncome()}, {@see self::LATE_FEE_NET_SQL}).
 *
 * - *Pénalités à recouvrer* (P206.03, ADR-0057, amendement du 2026-10-24, point 3) : un total à
 *   part, à côté de l'*Impayé*, qui ne change pas ({@see self::lateFeesOutstanding()}).
 *
 * Chaque lecteur recopiait son filtre ; trois d'entre eux comptaient le dépôt comme revenu et la
 * caution rendue comme une dette du locataire.
 */
final class CollectedPayments
{
    /** Les types de loyer qui sont un revenu encaissé. */
    public const LEASE_INCOME_TYPES = [
        LeasePaymentType::Rent,
        LeasePaymentType::Charges,
        LeasePaymentType::Regularization,
        LeasePaymentType::Penalty,
    ];

    /**
     * TCK-2733 — la caution versée par le locataire : hors revenu, elle reste dans le registre des
     * encaissements (`GET /api/payments/history`), qui en dit la part dans ses totaux. La caution
     * RENDUE (`deposit_refund`) n'en est pas.
     */
    public const DEPOSIT_TYPES = [LeasePaymentType::Deposit];

    /**
     * Les statuts d'une échéance due et non réglée, en tout ou en partie : ceux de
     * `HasPaymentAttributes::scopeOverdue`, des relances, des pénalités et du relevé du bailleur
     * (verif-595 passe 2 : `partially_paid` manquait, l'impayé se sous-estimait).
     */
    public const OWED_STATUSES = [PaymentStatus::Pending, PaymentStatus::PartiallyPaid, PaymentStatus::Late];

    /**
     * Le RESTE DÛ d'une échéance : son montant moins la part versée (`metadata.paid_amount`), jamais
     * négatif. C'est l'assiette de `LateFeeCalculator` et l'accesseur `remaining_amount`, en SQL —
     * versé négatif compris, lu comme 0 (`max(0.0, $metaPaid)` de `paidAmount()`).
     */
    public const OWED_REMAINING_SQL = 'GREATEST(lease_payments.amount - GREATEST('.self::PAID_AMOUNT_META_SQL.', 0), 0)';

    /**
     * TCK-2721 (contre-vérification, point 4) — `metadata.paid_amount` lu comme PHP le lit
     * (`(float)` de `HasPaymentAttributes::paidAmount()`), jamais NULL : le préfixe numérique d'une
     * chaîne (`"350,5"` → 350, `"1 000"` → 1, `"abc"` → 0), `true` → 1, absent ou `null` → 0.
     * Un `::numeric` nu levait sur une valeur non numérique écrite hors du modèle (le hook `saving`
     * la refuse), et le reste dû, le résumé financier, la balance âgée et le tri du registre des
     * encaissements tombaient en 500. Écart résiduel assumé : un tableau JSON non vide vaut 1 en PHP,
     * 0 ici. La regex n'a ni `?` ni antislash : le fragment passe dans des `selectRaw` à paramètres
     * positionnels. Écrit pour `lease_payments` ; les autres tables passent par
     * {@see self::paidAmountMetaSql()}. La parité est épinglée par `PaidAmountTolerantReadTest`.
     */
    private const PAID_AMOUNT_META_SQL = "(CASE WHEN lease_payments.metadata->'paid_amount' = 'true'::jsonb THEN 1"
        ." ELSE COALESCE(substring(lease_payments.metadata->>'paid_amount'"
        ." from '^[[:space:]]*([+-]{0,1}([0-9]+([.][0-9]*){0,1}|[.][0-9]+)([eE][+-]{0,1}[0-9]{1,3}){0,1})')::numeric, 0) END)";

    /** {@see self::PAID_AMOUNT_META_SQL} pour une table de paiements (`lease_payments`, `booking_payments`). */
    public static function paidAmountMetaSql(string $table): string
    {
        return str_replace('lease_payments.', $table.'.', self::PAID_AMOUNT_META_SQL);
    }

    /** Montant encaissé d'une échéance : ce qui a été payé, moins ce qui a été rendu (TCK-1214). */
    public const LEASE_NET_SQL = 'lease_payments.amount - COALESCE(lease_payments.refund_amount, 0)';

    /**
     * P206.02 — la pénalité de retard réglée d'une échéance, second agrégat de l'*Encaissé*, à dater
     * par `lease_payments.late_fee_paid_at`.
     */
    public const LATE_FEE_NET_SQL = 'COALESCE(lease_payments.late_fee_amount, 0) - COALESCE(lease_payments.late_fee_refund_amount, 0)';

    /** P206.03 — la pénalité appliquée et non réglée d'une échéance. */
    public const LATE_FEE_OUTSTANDING_SQL = 'COALESCE(lease_payments.late_fee_amount, 0)';

    /** Montant encaissé d'une ligne de réservation : ce qui a été payé, moins ce qui a été rendu. */
    public const BOOKING_NET_SQL = 'booking_payments.amount - COALESCE(booking_payments.refund_amount, 0)';

    /** @return list<string> */
    public static function leaseIncomeTypeValues(): array
    {
        return array_map(static fn (LeasePaymentType $t): string => $t->value, self::LEASE_INCOME_TYPES);
    }

    /** @return list<string> */
    public static function depositTypeValues(): array
    {
        return array_map(static fn (LeasePaymentType $t): string => $t->value, self::DEPOSIT_TYPES);
    }

    /** @return list<string> */
    public static function owedStatusValues(): array
    {
        return array_map(static fn (PaymentStatus $s): string => $s->value, self::OWED_STATUSES);
    }

    /** Loyers encaissés : payés, de type revenu. À sommer par {@see self::LEASE_NET_SQL}. */
    public static function leaseIncome(?Builder $query = null): Builder
    {
        $query ??= LeasePayment::query();

        return $query
            ->where('lease_payments.status', PaymentStatus::Paid->value)
            ->whereIn('lease_payments.payment_type', self::leaseIncomeTypeValues());
    }

    /**
     * P206.02 (ADR-0057, amendement du 2026-10-24, point 1) — les pénalités de retard réglées : une
     * ligne d'un type de revenu dont `late_fee_paid_at` est posé, quel que soit le statut du loyer
     * (une pénalité se règle sur un loyer encore `late`), sauf `cancelled`. À sommer par
     * {@see self::LATE_FEE_NET_SQL}, à dater par `late_fee_paid_at`.
     */
    public static function lateFeeIncome(?Builder $query = null): Builder
    {
        $query ??= LeasePayment::query();

        return $query
            ->where('lease_payments.status', '!=', PaymentStatus::Cancelled->value)
            ->whereIn('lease_payments.payment_type', self::leaseIncomeTypeValues())
            ->whereNotNull('lease_payments.late_fee_paid_at')
            ->where('lease_payments.late_fee_amount', '>', 0);
    }

    /**
     * P206.03 (ADR-0057, amendement du 2026-10-24, point 3) — les pénalités à recouvrer : appliquées
     * (`late_fee_amount > 0`) et non réglées (`late_fee_paid_at` nul), jamais sur une échéance
     * `cancelled` ou `refunded` (TCK-2504 : une échéance remboursée ne doit plus rien, pénalité
     * comprise) ni sur une restitution de caution. La règle de `LeasePayment::lateFeeOutstanding`,
     * en SQL — la parité est gardée par `PenalitesARecouvrerTest`, statut par statut. À sommer par
     * {@see self::LATE_FEE_OUTSTANDING_SQL}.
     */
    public static function lateFeesOutstanding(?Builder $query = null): Builder
    {
        $query ??= LeasePayment::query();

        return $query
            ->whereNotIn('lease_payments.status', [PaymentStatus::Cancelled->value, PaymentStatus::Refunded->value])
            ->where('lease_payments.late_fee_amount', '>', 0)
            ->whereNull('lease_payments.late_fee_paid_at')
            ->exceptDepositRefunds();
    }

    /** Paiements de réservation encaissés. À sommer par {@see self::BOOKING_NET_SQL}. */
    public static function bookingIncome(?Builder $query = null): Builder
    {
        $query ??= BookingPayment::query();

        return $query->where('booking_payments.status', PaymentStatus::Paid->value);
    }

    /**
     * Échéances dues et non réglées (sans la condition d'échéance, que le lecteur pose : échue pour un
     * impayé, à venir pour un « prochain loyer »). Jamais une restitution de caution.
     */
    public static function leaseOwed(?Builder $query = null): Builder
    {
        $query ??= LeasePayment::query();

        // Le scope de TCK-594 reste la définition de « ce n'est pas une restitution » : on le lit.
        return $query
            ->whereIn('lease_payments.status', self::owedStatusValues())
            ->exceptDepositRefunds();
    }
}
