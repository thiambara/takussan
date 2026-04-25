<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lease_payments', function (Blueprint $table) {
            $table->renameColumn('late_fee', 'late_fee_amount');
        });

        Schema::table('lease_payments', function (Blueprint $table) {
            $table->timestamp('late_fee_applied_at')->nullable()->after('late_fee_amount');
        });
    }

    public function down(): void
    {
        Schema::table('lease_payments', function (Blueprint $table) {
            $table->dropColumn('late_fee_applied_at');
        });

        Schema::table('lease_payments', function (Blueprint $table) {
            $table->renameColumn('late_fee_amount', 'late_fee');
        });
    }
};
