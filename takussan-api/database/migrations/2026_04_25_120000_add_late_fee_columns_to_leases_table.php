<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            $table->decimal('late_fee_percent', 5, 2)->nullable()->after('payment_day');
            $table->unsignedSmallInteger('late_fee_grace_days')->nullable()->after('late_fee_percent');
        });
    }

    public function down(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            $table->dropColumn(['late_fee_percent', 'late_fee_grace_days']);
        });
    }
};
