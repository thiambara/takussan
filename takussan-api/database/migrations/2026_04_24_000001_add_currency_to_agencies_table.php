<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-084 — store the agency-level default currency.
 *
 * `char(3)` mirrors ISO 4217 codes; the default `XOF` keeps the existing
 * Senegal-first behaviour for legacy rows. The migration is idempotent: if a
 * previous wave already added the column, we skip the alter — useful when the
 * settings JSON convention was retro-fitted in TCK-064.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('agencies', 'currency')) {
            return;
        }

        Schema::table('agencies', function (Blueprint $table) {
            $table->char('currency', 3)->default('XOF')->after('commission_rate');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('agencies', 'currency')) {
            return;
        }

        Schema::table('agencies', function (Blueprint $table) {
            $table->dropColumn('currency');
        });
    }
};
