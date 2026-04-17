<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->foreignId('payer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('collector_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reference_number')->nullable();
            $table->string('receipt_number')->nullable();
            $table->decimal('amount', 14, 2);
            $table->string('currency', 3)->default('XOF');
            $table->string('payment_method')->nullable();
            $table->string('payment_type');
            $table->string('status')->default('pending');
            $table->decimal('refund_amount', 14, 2)->nullable();
            $table->text('refund_reason')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->string('transaction_id')->nullable();
            $table->text('notes')->nullable();
            $table->json('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['booking_id', 'status']);
            $table->index('payment_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_payments');
    }
};
