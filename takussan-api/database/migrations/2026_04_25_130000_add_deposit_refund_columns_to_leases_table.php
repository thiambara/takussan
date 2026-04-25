<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            $table->decimal('deposit_refunded_amount', 14, 2)->nullable()->after('deposit_amount');
            $table->timestamp('deposit_refunded_at')->nullable()->after('deposit_refunded_amount');
            $table->text('deposit_refund_reason')->nullable()->after('deposit_refunded_at');
        });
    }

    public function down(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            $table->dropColumn(['deposit_refunded_amount', 'deposit_refunded_at', 'deposit_refund_reason']);
        });
    }
};
