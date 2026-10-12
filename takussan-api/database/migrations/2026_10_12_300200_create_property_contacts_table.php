<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 (lot C) — les contacts SUR PLACE d'un bien (gardien, voisin) : trois au plus, au format
 * joignable mais non vérifiés. Ils ne sortent au public que par l'endpoint de contact limité.
 *
 * Noms explicites (piège PostgreSQL n° 3) ; la FK est indexée par l'index composé, dont elle est
 * la colonne de tête (piège n° 8 : PostgreSQL n'indexe pas une FK de lui-même). Le plafond de 3
 * est une règle applicative (`ReplacePropertyContactsRequest`, verrou sur la ligne du bien).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('property_contacts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('property_id');
            $table->string('label', 60)->nullable();
            $table->string('phone', 30);
            $table->boolean('has_whatsapp')->default(false);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            $table->foreign('property_id', 'property_contacts_property_fk')
                ->references('id')->on('properties')->cascadeOnDelete();
            $table->index(['property_id', 'position'], 'property_contacts_property_position_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('property_contacts');
    }
};
