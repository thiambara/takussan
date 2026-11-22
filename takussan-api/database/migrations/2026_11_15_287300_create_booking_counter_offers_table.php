<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2873 (ADR-0110 § 5) — la contre-offre de l'agence sur une offre d'achat en attente.
 *
 * - `amount` : le prix proposé, décimal en base comme `bookings.total_amount` (principe 3) ;
 * - `valid_until` : le dernier jour où le client peut l'accepter (fin de journée de Dakar,
 *   `FinInclusive`) ; au-delà, la tâche d'expiration la passe `expired` ;
 * - `status` : `App\Models\Enums\CounterOfferStatus` (chaîne en base, ADR-0007) ;
 * - `responded_at` : l'instant de la réponse du client (acceptée ou déclinée).
 *
 * Aucune donnée existante : pas de rattrapage.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_counter_offers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->decimal('amount', 15, 2);
            $table->string('message', 500)->nullable();
            $table->date('valid_until');
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 16)->default('pending');
            $table->timestamp('responded_at')->nullable();
            $table->timestamps();

            $table->index(['booking_id', 'status']);
            // La tâche d'expiration lit les contre-offres en attente échues.
            $table->index(['status', 'valid_until']);
            $table->index('created_by_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_counter_offers');
    }
};
