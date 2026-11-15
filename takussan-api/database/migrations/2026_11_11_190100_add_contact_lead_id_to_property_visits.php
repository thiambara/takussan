<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2582 (ADR-0101) — la visite connaît la demande de contact qui l'a amenée
 * (`POST /api/property-visits {contact_lead_id}`). `nullOnDelete` : la demande supprimée laisse la
 * visite. Indexée : PostgreSQL ne pose aucun index sous une FK.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('property_visits', function (Blueprint $table) {
            $table->foreignId('contact_lead_id')->nullable()
                ->constrained('property_contact_leads', 'id', 'property_visits_contact_lead_fk')
                ->nullOnDelete();

            $table->index('contact_lead_id', 'property_visits_contact_lead_idx');
        });
    }

    public function down(): void
    {
        Schema::table('property_visits', function (Blueprint $table) {
            $table->dropForeign('property_visits_contact_lead_fk');
            $table->dropIndex('property_visits_contact_lead_idx');
            $table->dropColumn('contact_lead_id');
        });
    }
};
