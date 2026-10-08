<?php

use App\Models\Property;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-599 §5 — un favori prévient d'une baisse de prix et d'une sortie du public.
 *
 * `alert_baseline_price` est le prix depuis lequel une baisse se juge : `decimal(14,2)` comme
 * `properties.price` (contrainte 9, aucune comparaison en flottant), initialisé au prix courant
 * pour l'existant — une baisse antérieure à cette migration n'est pas annoncée.
 * `unavailable_notified_at` empêche d'annoncer deux fois la même sortie du public.
 * ⚠ Ce prix n'est jamais émis : `FavoriteResource` ne le lit pas (contrainte 3).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('favorites', function (Blueprint $table) {
            $table->decimal('alert_baseline_price', 14, 2)->nullable();
            $table->timestamp('unavailable_notified_at')->nullable();
        });

        DB::statement('UPDATE favorites SET alert_baseline_price = properties.price '
            .'FROM properties WHERE properties.id = favorites.property_id');

        // Un favori déjà hors du public avant cette migration n'est pas « devenu » indisponible :
        // il est marqué annoncé, sans quoi le premier passage du job annoncerait tout l'historique.
        // Le juge est `scopePublic()` lui-même, jamais une copie de ses conditions.
        DB::table('favorites')
            ->whereNotIn('property_id', Property::query()->public()->select('id'))
            ->update(['unavailable_notified_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('favorites', function (Blueprint $table) {
            $table->dropColumn(['alert_baseline_price', 'unavailable_notified_at']);
        });
    }
};
