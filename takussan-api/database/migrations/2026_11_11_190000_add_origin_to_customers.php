<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2582 (ADR-0101) — la fiche client sait d'où elle vient : la demande de contact qui l'a fait
 * naître (ou à laquelle elle a été rattachée en premier) et le bien qui a fait venir la personne.
 * Le seul lien était `property_contact_leads.customer_id`, lu dans l'autre sens.
 *
 * `nullOnDelete` des deux côtés : la demande ou le bien supprimés laissent la fiche, sans origine.
 * Les FK portent des noms courts et explicites (les deux tables se citent l'une l'autre), et chaque
 * colonne son index : PostgreSQL n'en pose aucun sous une FK, et le `nullOnDelete` d'un bien
 * supprimé relit la colonne.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->foreignId('source_contact_lead_id')->nullable()
                ->constrained('property_contact_leads', 'id', 'customers_source_lead_fk')
                ->nullOnDelete();
            $table->foreignId('interested_property_id')->nullable()
                ->constrained('properties', 'id', 'customers_interested_property_fk')
                ->nullOnDelete();

            $table->index('source_contact_lead_id', 'customers_source_lead_idx');
            $table->index('interested_property_id', 'customers_interested_property_idx');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropForeign('customers_source_lead_fk');
            $table->dropForeign('customers_interested_property_fk');
            $table->dropIndex('customers_source_lead_idx');
            $table->dropIndex('customers_interested_property_idx');
            $table->dropColumn(['source_contact_lead_id', 'interested_property_id']);
        });
    }
};
