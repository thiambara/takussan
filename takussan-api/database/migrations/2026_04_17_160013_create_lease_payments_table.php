<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lease_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lease_id')->constrained('leases')->cascadeOnDelete();
            $table->foreignId('payer_id')->constrained('customers')->restrictOnDelete();
            $table->foreignId('collector_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reference_number')->nullable();
            $table->decimal('amount', 14, 2);
            $table->string('currency', 3)->default('XOF');
            $table->string('payment_method')->nullable();
            $table->string('payment_type');
            $table->date('period_start');
            $table->date('period_end');
            $table->date('due_date')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->string('status')->default('pending');
            $table->decimal('late_fee', 14, 2)->nullable();
            $table->string('transaction_id')->nullable();
            $table->text('notes')->nullable();
            $table->jsonb('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['due_date', 'status']);
            $table->index(['lease_id', 'period_start']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lease_payments');
    }
};
