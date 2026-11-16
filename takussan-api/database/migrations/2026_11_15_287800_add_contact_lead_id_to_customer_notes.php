<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2878 (TCK-2875 AC6) — la note `lead_message` nomme la demande dont elle reprend le message :
 * le fil de la fiche sert alors le BIEN de cette demande, et l'historique d'une candidature borne
 * « Demande de contact reçue » à son bien. `nullOnDelete` : une demande effacée laisse la note.
 *
 * Rattrapage : une note `lead_message` est datée de sa demande (`ContactLeadService::linkLead`) ;
 * elle est reliée à la demande de la même fiche créée au même instant, et seulement quand UNE seule
 * demande y répond — sinon la note reste sans demande, plutôt qu'avec la mauvaise.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customer_notes', function (Blueprint $table) {
            $table->foreignId('contact_lead_id')->nullable()->after('property_visit_id')
                ->constrained('property_contact_leads')->nullOnDelete();
            $table->index('contact_lead_id');
        });

        DB::statement(<<<'SQL'
            UPDATE customer_notes n
            SET contact_lead_id = (
                SELECT l.id FROM property_contact_leads l
                WHERE l.customer_id = n.customer_id AND l.created_at = n.created_at
            )
            WHERE n.kind = 'lead_message'
              AND n.contact_lead_id IS NULL
              AND (
                SELECT count(*) FROM property_contact_leads l
                WHERE l.customer_id = n.customer_id AND l.created_at = n.created_at
              ) = 1
            SQL);
    }

    public function down(): void
    {
        Schema::table('customer_notes', function (Blueprint $table) {
            $table->dropForeign(['contact_lead_id']);
            $table->dropIndex(['contact_lead_id']);
            $table->dropColumn('contact_lead_id');
        });
    }
};
