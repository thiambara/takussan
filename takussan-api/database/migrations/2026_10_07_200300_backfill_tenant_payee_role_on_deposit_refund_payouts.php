<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-594 (ADR-0039 §2, AC23) — les remboursements de caution existants passent à `tenant`.
 *
 * `DepositRefundService` écrivait, dans la même transaction, un `LeasePayment` `deposit_refund` et
 * un `Payout` du même bail, du même montant, à la même seconde. C'est la seule empreinte qui les
 * distingue d'un reversement ordinaire : le `Payout` ne portait ni type ni lien vers le paiement.
 * Le compte des lignes passées est écrit dans les Notes du ticket, mesuré en préproduction.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            UPDATE payouts SET payee_role = 'tenant'
            WHERE payee_role = 'landlord'
              AND EXISTS (
                SELECT 1 FROM lease_payments lp
                WHERE lp.lease_id = payouts.lease_id
                  AND lp.payment_type = 'deposit_refund'
                  AND lp.amount = payouts.net_amount
                  AND date_trunc('second', lp.created_at) = date_trunc('second', payouts.created_at)
              )
        SQL);
    }

    public function down(): void
    {
        DB::table('payouts')->where('payee_role', 'tenant')->update(['payee_role' => 'landlord']);
    }
};
