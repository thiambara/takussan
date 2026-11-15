<?php

namespace App\Services\Lease;

use App\Models\Enums\InvoiceKind;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2642 — la caution restant à rendre d'un bail ({@see Lease::getDepositRemainingAttribute()}),
 * en SQL : une sous-requête scalaire corrélée à la ligne `$table`, pour filtrer, compter et trier la
 * file « À traiter » (`deposit_to_refund`) sans lire chaque bail en PHP.
 *
 * Même règle, terme à terme (TCK-2375, VERIF-594 passe 4) :
 *
 * - la chaîne : le bail et les baux qu'il renouvelle (`renewed_from_lease_id`), au plus
 *   `MAX_CHAIN_DEPTH × 2` ancêtres, interrompue par un ancêtre supprimé (`find()` le perd aussi) ;
 * - la base : le plus petit du montant écrit au bail et de la caution ENCAISSÉE sur la chaîne
 *   (échéances `deposit` payées, `LeasePayment::scopePaidDepositMovements`) ;
 * - moins ce que la chaîne a rendu (`deposit_refunded_amount`) et retenu (factures de retenue
 *   vivantes, liées à un reversement au locataire hors constaté, {@see Lease::liveDepositRetention()}) ;
 * - arrondi au centime, jamais négatif.
 *
 * `DepositRemainingParityTest` tient l'égalité avec l'accesseur, chaîne et retenue comprises.
 */
final class DepositRemaining
{
    public static function sql(string $table = 'leases'): string
    {
        $pdo = DB::connection()->getPdo();
        $leaseClass = $pdo->quote(Lease::class);
        $paid = $pdo->quote(PaymentStatus::Paid->value);
        $deposit = $pdo->quote(LeasePaymentType::Deposit->value);
        $tenant = $pdo->quote(PayeeRole::Tenant->value);
        $invoice = $pdo->quote(InvoiceKind::Invoice->value);
        $live = implode(', ', array_map(fn (InvoiceStatus $s) => $pdo->quote($s->value),
            [InvoiceStatus::Draft, InvoiceStatus::Sent, InvoiceStatus::Overdue, InvoiceStatus::Paid]));
        $depth = LeaseRenewalService::MAX_CHAIN_DEPTH * 2;

        $chain = "WITH RECURSIVE dep_chain(id, parent_id, depth) AS (
                SELECT {$table}.id, {$table}.renewed_from_lease_id, 0
                UNION ALL
                SELECT anc.id, anc.renewed_from_lease_id, dep_chain.depth + 1
                FROM leases anc JOIN dep_chain ON anc.id = dep_chain.parent_id
                WHERE anc.deleted_at IS NULL AND dep_chain.depth < {$depth}
            )";

        $collected = "COALESCE((SELECT SUM(dp.amount) FROM lease_payments dp
                WHERE dp.lease_id IN (SELECT id FROM dep_chain) AND dp.deleted_at IS NULL
                AND dp.status = {$paid} AND dp.payment_type = {$deposit}), 0)";

        $refunded = 'COALESCE((SELECT SUM(COALESCE(rl.deposit_refunded_amount, 0)) FROM leases rl
                WHERE rl.id IN (SELECT id FROM dep_chain)), 0)';

        $retained = "COALESCE((SELECT SUM(inv.total_amount) FROM invoices inv
                WHERE inv.invoiceable_type = {$leaseClass} AND inv.invoiceable_id IN (SELECT id FROM dep_chain)
                AND inv.deleted_at IS NULL AND inv.kind = {$invoice} AND inv.status IN ({$live})
                AND inv.id IN (SELECT (po.metadata->>'invoice_id')::bigint FROM payouts po
                    WHERE po.lease_id = inv.invoiceable_id AND po.deleted_at IS NULL
                    AND po.payee_role = {$tenant} AND po.refunded_payment_id IS NULL
                    AND po.metadata->>'invoice_id' IS NOT NULL)), 0)";

        return "({$chain} SELECT GREATEST(ROUND(LEAST(COALESCE({$table}.deposit_amount, 0), {$collected}) - {$refunded} - {$retained}, 2), 0))";
    }
}
