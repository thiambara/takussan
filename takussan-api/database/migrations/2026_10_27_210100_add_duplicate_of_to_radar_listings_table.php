<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2387 (ADR-0077) — de quoi une annonce est le doublon : une autre annonce collectée, OU un bien
 * du catalogue, jamais les deux (contrainte CHECK). Les deux clés se vident avec leur cible.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_listings', function (Blueprint $table) {
            $table->foreignId('duplicate_of_listing_id')->nullable()
                ->constrained('radar_listings', 'id', 'radar_listings_dup_listing_fk')->nullOnDelete();
            $table->foreignId('duplicate_of_property_id')->nullable()
                ->constrained('properties', 'id', 'radar_listings_dup_property_fk')->nullOnDelete();
            $table->index('duplicate_of_listing_id', 'radar_listings_dup_listing_idx');
            $table->index('duplicate_of_property_id', 'radar_listings_dup_property_idx');
        });
        DB::statement('ALTER TABLE radar_listings ADD CONSTRAINT radar_listings_dup_one_chk '
            .'CHECK (duplicate_of_listing_id IS NULL OR duplicate_of_property_id IS NULL)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE radar_listings DROP CONSTRAINT IF EXISTS radar_listings_dup_one_chk');
        Schema::table('radar_listings', function (Blueprint $table) {
            $table->dropForeign('radar_listings_dup_listing_fk');
            $table->dropForeign('radar_listings_dup_property_fk');
            $table->dropIndex('radar_listings_dup_listing_idx');
            $table->dropIndex('radar_listings_dup_property_idx');
            $table->dropColumn(['duplicate_of_listing_id', 'duplicate_of_property_id']);
        });
    }
};
