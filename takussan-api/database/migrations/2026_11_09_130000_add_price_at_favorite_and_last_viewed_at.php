<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2507 — deux repères pour la page Favoris (audit UX, famille 1).
 *
 * `favorites.price_at_favorite` : le prix du bien AU MOMENT de l'ajout, jamais rebasé. Il ne se confond pas avec
 * `alert_baseline_price`, que `SendFavoriteChangeAlerts` rebase à chaque passage et qui ne peut donc pas dire « depuis
 * l'ajout ». Pas de rétro-remplissage : un favori antérieur garde `null` (son prix d'ajout n'est connu nulle part ;
 * la base d'alerte d'aujourd'hui en serait une contrefaçon).
 *
 * `saved_searches.last_viewed_at` : la dernière ouverture de la recherche par son titulaire, que le front compare à
 * `published_at` pour compter les biens arrivés depuis.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('favorites', function (Blueprint $table) {
            $table->decimal('price_at_favorite', 14, 2)->nullable()->after('alert_baseline_price');
        });
        Schema::table('saved_searches', function (Blueprint $table) {
            $table->timestamp('last_viewed_at')->nullable()->after('last_notified_at');
        });
    }

    public function down(): void
    {
        Schema::table('favorites', function (Blueprint $table) {
            $table->dropColumn('price_at_favorite');
        });
        Schema::table('saved_searches', function (Blueprint $table) {
            $table->dropColumn('last_viewed_at');
        });
    }
};
