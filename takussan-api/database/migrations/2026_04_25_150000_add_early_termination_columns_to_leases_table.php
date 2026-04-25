<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-090 — Early termination columns on `leases`.
 *
 * `terminated_at`, `terminated_by_id` and `termination_reason` already exist
 * (TCK-027) and are reused for the final transition. The new columns track
 * the *request* (notice period in flight) separately so we can:
 *   - resume the cancellation window (until effective_date),
 *   - distinguish a request being processed from a fully-terminated lease,
 *   - link the penalty invoice without polluting `metadata`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            $table->timestamp('early_termination_requested_at')->nullable()
                ->after('terminated_by_id');
            $table->foreignId('early_termination_requested_by')->nullable()
                ->after('early_termination_requested_at')
                ->constrained('users')->nullOnDelete();
            $table->date('early_termination_effective_date')->nullable()
                ->after('early_termination_requested_by');
            $table->decimal('early_termination_penalty_amount', 14, 2)->nullable()
                ->after('early_termination_effective_date');
            $table->text('early_termination_reason')->nullable()
                ->after('early_termination_penalty_amount');
            $table->unsignedSmallInteger('notice_period_days')->nullable()
                ->after('early_termination_reason');
            $table->foreignId('early_termination_invoice_id')->nullable()
                ->after('notice_period_days')
                ->constrained('invoices')->nullOnDelete();

            // Allows the daily job to scan only leases in the terminating
            // window without table-scanning the whole `leases` table.
            $table->index(
                ['status', 'early_termination_effective_date'],
                'leases_status_early_termination_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            $table->dropIndex('leases_status_early_termination_idx');
            $table->dropConstrainedForeignId('early_termination_invoice_id');
            $table->dropConstrainedForeignId('early_termination_requested_by');
            $table->dropColumn([
                'early_termination_requested_at',
                'early_termination_effective_date',
                'early_termination_penalty_amount',
                'early_termination_reason',
                'notice_period_days',
            ]);
        });
    }
};
