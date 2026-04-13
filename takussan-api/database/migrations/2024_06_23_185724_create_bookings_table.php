<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained('properties')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');

            // Informations de réservation
            $table->string('reference_number')->unique()->nullable();
            $table->string('status')->default('pending')->index(); // ['pending', 'confirmed', 'rejected', 'cancelled', 'completed']

            // Dates importantes
            $table->timestamp('booking_date')->useCurrent();
            $table->timestamp('start_date')->nullable();
            $table->timestamp('end_date')->nullable();
            $table->timestamp('expiration_date')->nullable();
            $table->timestamp('confirmation_date')->nullable();
            $table->timestamp('rejection_date')->nullable();
            $table->timestamp('cancellation_date')->nullable();
            $table->timestamp('completion_date')->nullable();

            // Informations financières
            $table->decimal('price_at_booking', 14)->nullable();
            $table->decimal('total_amount', 14, 2)->nullable();
            $table->decimal('deposit_amount', 14)->nullable();
            $table->boolean('deposit_paid')->default(false);
            $table->timestamp('deposit_date')->nullable();

            // Informations supplémentaires
            $table->text('notes')->nullable();
            $table->text('reason_for_rejection')->nullable();
            $table->text('reason_for_cancellation')->nullable();
            $table->string('cancellation_by')->nullable();
            $table->json('metadata')->nullable();

            // Timestamps et soft delete
            $table->timestamps();
            $table->softDeletes();


            // Pour qu'un user retrouve vite ses réservations par statut
            $table->index(['user_id', 'status'], 'bookings_user_status_idx');

            // Pour le calendrier des disponibilités
            $table->index(['property_id', 'booking_date'], 'bookings_property_date_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bookings');
    }
};
