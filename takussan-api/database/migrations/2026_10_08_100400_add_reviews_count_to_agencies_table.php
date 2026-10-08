<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-597 (ADR-0043 §6, AC12) — l'agence stocke son nombre d'avis publiés à côté de sa moyenne,
 * comme le bien. Et les deux agrégats se recomptent sur les SEULS avis `is_approved = true` : la
 * moyenne stockée comptait aussi les avis en attente.
 *
 * Mesuré à la rédaction : `agencies` n'avait pas de `reviews_count`, et `ReviewObserver` ne le
 * posait que sur les tables qui le portent (`Schema::hasColumn`). Le recompte de reprise est écrit
 * en SQL, pour les agences comme pour les biens.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->unsignedInteger('reviews_count')->default(0)->after('average_rating');
        });

        foreach (['agencies' => 'App\Models\Agency', 'properties' => 'App\Models\Property'] as $table => $type) {
            DB::statement(<<<SQL
                UPDATE {$table} SET
                    reviews_count = COALESCE(s.cnt, 0),
                    average_rating = s.avg
                FROM (
                    SELECT t.id, agg.cnt, agg.avg FROM {$table} t
                    LEFT JOIN (
                        SELECT reviewable_id, COUNT(*) AS cnt, ROUND(AVG(rating)::numeric, 2) AS avg
                        FROM reviews
                        WHERE reviewable_type = ? AND is_approved = true AND deleted_at IS NULL
                        GROUP BY reviewable_id
                    ) agg ON agg.reviewable_id = t.id
                ) s
                WHERE {$table}.id = s.id
            SQL, [$type]);
        }
    }

    public function down(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->dropColumn('reviews_count');
        });
    }
};
