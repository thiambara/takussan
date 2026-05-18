<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('booking_payments', function (Blueprint $table): void {
            $table->decimal('platform_fee_pct_at_payment', 5, 2)->nullable()->after('paid_at');
            $table->foreignId('platform_payout_id')->nullable()->after('platform_fee_pct_at_payment')
                ->constrained('platform_payouts')->nullOnDelete();
        });

        Schema::table('lease_payments', function (Blueprint $table): void {
            $table->decimal('platform_fee_pct_at_payment', 5, 2)->nullable()->after('paid_at');
            $table->foreignId('platform_payout_id')->nullable()->after('platform_fee_pct_at_payment')
                ->constrained('platform_payouts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('booking_payments', function (Blueprint $table): void {
            $table->dropForeign(['platform_payout_id']);
            $table->dropColumn(['platform_fee_pct_at_payment', 'platform_payout_id']);
        });

        Schema::table('lease_payments', function (Blueprint $table): void {
            $table->dropForeign(['platform_payout_id']);
            $table->dropColumn(['platform_fee_pct_at_payment', 'platform_payout_id']);
        });
    }
};
