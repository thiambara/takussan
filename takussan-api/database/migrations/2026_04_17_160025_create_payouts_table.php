<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lease_id')->nullable()->constrained('leases')->nullOnDelete();
            $table->foreignId('booking_id')->nullable()->constrained('bookings')->nullOnDelete();
            $table->foreignId('agency_id')->nullable()->constrained('agencies')->nullOnDelete();
            $table->foreignId('landlord_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('issued_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reference_number')->unique();
            $table->string('status')->default('pending');
            $table->date('period_start')->nullable();
            $table->date('period_end')->nullable();
            $table->decimal('gross_amount', 14, 2);
            $table->decimal('commission_amount', 14, 2)->default(0);
            $table->decimal('fees_amount', 14, 2)->nullable();
            $table->decimal('net_amount', 14, 2);
            $table->string('currency', 3)->default('XOF');
            $table->string('payment_method')->nullable();
            $table->string('transaction_id')->nullable();
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->text('failed_reason')->nullable();
            $table->text('notes')->nullable();
            $table->jsonb('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['landlord_id', 'status']);
            $table->index(['lease_id', 'period_start']);
            $table->index(['status', 'scheduled_at']);
        });

        Schema::create('payout_lease_payment', function (Blueprint $table) {
            $table->foreignId('payout_id')->constrained('payouts')->cascadeOnDelete();
            $table->foreignId('lease_payment_id')->constrained('lease_payments')->cascadeOnDelete();
            $table->primary(['payout_id', 'lease_payment_id']);
        });

        Schema::create('payout_booking_payment', function (Blueprint $table) {
            $table->foreignId('payout_id')->constrained('payouts')->cascadeOnDelete();
            $table->foreignId('booking_payment_id')->constrained('booking_payments')->cascadeOnDelete();
            $table->primary(['payout_id', 'booking_payment_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payout_booking_payment');
        Schema::dropIfExists('payout_lease_payment');
        Schema::dropIfExists('payouts');
    }
};
