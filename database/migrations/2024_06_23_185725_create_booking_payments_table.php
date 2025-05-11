<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');

            // Informations de paiement
            $table->decimal('amount', 14);
            $table->string('payment_method');
            $table->string('payment_type');
            $table->string('transaction_id')->nullable();

            // Statut
            $table->string('status')->default('pending')->index(); //['pending', 'completed', 'failed', 'refunded', 'partially_refunded']

            // Dates
            $table->timestamp('payment_date')->nullable();
            $table->timestamp('confirmed_date')->nullable();

            // Informations supplémentaires
            $table->string('receipt_number')->nullable();
            $table->text('notes')->nullable();
            $table->json('metadata')->nullable();

            // Timestamps
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
