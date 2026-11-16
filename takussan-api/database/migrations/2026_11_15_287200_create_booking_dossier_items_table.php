<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2872 (ADR-0110 § 2) — le dossier d'une candidature ou d'une offre : une ligne par pièce
 * attendue, posée à la création de la réservation (`App\Services\Booking\BookingDossierService`).
 *
 * - `piece` : `App\Models\Enums\DossierPiece` (chaîne en base, ADR-0007) ; unique par réservation ;
 * - `document_id` : la pièce reçue, un `Document` dont le porteur est la réservation. Le document
 *   se supprime en douceur : la colonne garde alors son identifiant, et la complétude ne compte
 *   qu'un document VIVANT (`BookingDossierService::summaries`). `nullOnDelete` couvre l'effacement
 *   définitif (archive du coffre, effacement du compte) ;
 * - `requested_at` / `requested_by_id` : le dernier « Demander » (une fois par pièce et par 24 h).
 *
 * **Rattrapage** : les candidatures et les offres déjà en base reçoivent leur liste fixe (aucune
 * pièce reçue, aucune demande) — sans elle, leur dossier serait vide et dirait « complet ». Le
 * séjour n'a pas de dossier.
 */
return new class extends Migration
{
    /** Les listes fixes d'ADR-0110 § 2, recopiées : une migration ne lit pas le code qui changera. */
    private const LISTES = [
        'application' => ['identity', 'payslips', 'employment_certificate'],
        'offer' => ['identity', 'proof_of_funds'],
    ];

    public function up(): void
    {
        Schema::create('booking_dossier_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->string('piece', 32);
            $table->boolean('required')->default(true);
            $table->foreignId('document_id')->nullable()->constrained('documents')->nullOnDelete();
            $table->timestamp('requested_at')->nullable();
            $table->foreignId('requested_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('received_at')->nullable();
            $table->timestamps();

            $table->unique(['booking_id', 'piece']);
            $table->index('document_id');
        });

        foreach (self::LISTES as $kind => $pieces) {
            foreach ($pieces as $piece) {
                DB::statement(
                    'insert into booking_dossier_items (booking_id, piece, required, created_at, updated_at)
                     select id, ?, true, now(), now() from bookings where kind = ?',
                    [$piece, $kind],
                );
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_dossier_items');
    }
};
