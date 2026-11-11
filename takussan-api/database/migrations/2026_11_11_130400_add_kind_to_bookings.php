<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2579 (ADR-0102) — une réservation porte sa nature : `stay`, `application` ou `offer`.
 *
 * Rattrapage, une seule requête jointe sur `properties` (lignes supprimées des deux côtés
 * comprises, la colonne devient NOT NULL juste après) :
 *
 *   1. le contrat CONNU au moment de la réservation l'emporte : `metadata.kind = 'offer'` (le seul
 *      que le tunnel public ait jamais écrit, TCK-176) → `offer` ;
 *   2. une demande qui porte `metadata.guests` venait du tunnel de LOCATION : si le bien est
 *      depuis passé en vente, la période d'alors est inconnue → `application` (cas ambigu) ;
 *   3. sinon, le contrat ACTUEL du bien, même règle que `BookingKind::forProperty()` : vente →
 *      `offer`, location `daily`/`weekly` → `stay`, toute autre location → `application`.
 *
 * Les cas ambigus (1 sur un bien aujourd'hui en location, 2) sont comptés au journal, comme
 * l'exige ADR-0102 § Conséquences. Les colonnes de l'offre publique sont recopiées de `metadata`
 * (`offer_expires_at`, `list_price_at_offer`) sous une forme vérifiée : une valeur illisible reste
 * nulle plutôt que de faire échouer la migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('kind', 16)->nullable();
            $table->date('offer_expires_at')->nullable();
            $table->decimal('list_price_at_booking', 14, 2)->nullable();
        });

        $ambigus = DB::selectOne(<<<'SQL'
            SELECT
                COUNT(*) FILTER (WHERE b.metadata->>'kind' = 'offer' AND p.contract_type <> 'sale') AS offre_sur_location,
                COUNT(*) FILTER (WHERE COALESCE(b.metadata->>'kind', '') <> 'offer' AND b.metadata->'guests' IS NOT NULL AND p.contract_type = 'sale') AS location_sur_vente
            FROM bookings b
            JOIN properties p ON p.id = b.property_id
            SQL);

        DB::statement(<<<'SQL'
            UPDATE bookings b
            SET kind = CASE
                WHEN b.metadata->>'kind' = 'offer' THEN 'offer'
                WHEN b.metadata->'guests' IS NOT NULL AND p.contract_type = 'sale' THEN 'application'
                WHEN p.contract_type = 'sale' THEN 'offer'
                WHEN p.rent_period IN ('daily', 'weekly') THEN 'stay'
                ELSE 'application'
            END
            FROM properties p
            WHERE p.id = b.property_id
            SQL);

        DB::statement(<<<'SQL'
            UPDATE bookings
            SET offer_expires_at = CASE
                    WHEN metadata->>'offer_expires_at' ~ '^\d{4}-\d{2}-\d{2}'
                    THEN LEFT(metadata->>'offer_expires_at', 10)::date
                END,
                list_price_at_booking = CASE
                    WHEN metadata->>'list_price_at_offer' ~ '^\d{1,12}(\.\d+)?$'
                    THEN ROUND((metadata->>'list_price_at_offer')::numeric, 2)
                END
            WHERE metadata->>'kind' = 'offer'
            SQL);

        Log::notice('[migration] add_kind_to_bookings — cas ambigus du rattrapage', [
            'offre_sur_bien_en_location' => (int) ($ambigus->offre_sur_location ?? 0),
            'location_sur_bien_en_vente' => (int) ($ambigus->location_sur_vente ?? 0),
        ]);

        Schema::table('bookings', function (Blueprint $table) {
            $table->string('kind', 16)->nullable(false)->change();
            $table->index(['agency_id', 'kind', 'status'], 'bookings_agency_kind_status_idx');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropIndex('bookings_agency_kind_status_idx');
            $table->dropColumn(['kind', 'offer_expires_at', 'list_price_at_booking']);
        });
    }
};
