<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Performance audit follow-up. The dominant access pattern on these growing
 * transactional tables is "scope by agency_id, filter by status, sort by a
 * date column". Previously:
 *   - bookings/leases/invoices had no leading-agency_id composite, so the
 *     agency-scoped + status-filtered list could not be served by one index;
 *   - the user-facing `sort=` date columns (start_date/end_date/issue_date/
 *     due_date) were unindexed, forcing a filesort that degrades as rows grow.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->index(['agency_id', 'status']);
            $table->index('start_date');
            $table->index('end_date');
        });

        Schema::table('leases', function (Blueprint $table): void {
            $table->index(['agency_id', 'status']);
            $table->index('start_date');
            $table->index('end_date');
        });

        Schema::table('invoices', function (Blueprint $table): void {
            $table->index(['agency_id', 'status']);
            $table->index('issue_date');
            $table->index('due_date');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropIndex(['agency_id', 'status']);
            $table->dropIndex(['start_date']);
            $table->dropIndex(['end_date']);
        });

        Schema::table('leases', function (Blueprint $table): void {
            $table->dropIndex(['agency_id', 'status']);
            $table->dropIndex(['start_date']);
            $table->dropIndex(['end_date']);
        });

        Schema::table('invoices', function (Blueprint $table): void {
            $table->dropIndex(['agency_id', 'status']);
            $table->dropIndex(['issue_date']);
            $table->dropIndex(['due_date']);
        });
    }
};
