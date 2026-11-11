<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2652 — `status_changed_at` date l'entrée de l'intervention dans son statut courant : c'est le
 * `waiting_since` des files (`App\Services\Maintenance\MaintenanceQueue`). Le modèle la pose à toute
 * écriture qui change `status` (`MaintenanceRequest::booted()`), quel que soit le chemin — machine
 * d'état, devis, acceptation, clôture automatique, seeders.
 *
 * **Rétro-remplissage, et pourquoi pas le journal d'activité.** Le ticket demandait de le lire d'abord.
 * Relevé sur la démo le 2026-11-11 : les lignes `activity_log` des interventions sont les seuls
 * `created`/`updated` génériques, à `properties` vide — aucune ne dit le statut quitté ni atteint.
 * Le choix retenu, statut par statut :
 *
 *  - `open` → `created_at` : une demande ouverte n'a jamais quitté son premier statut (exact) ;
 *  - `quote_submitted` → `quote_submitted_at`, `approved` et `rejected` → `quote_decision_at`,
 *    `in_progress` → `started_at`, `completed` → `completed_at` : la colonne qui date le geste
 *    d'entrée ;
 *  - tout autre statut, et toute colonne datée encore nulle → `updated_at`, la meilleure borne
 *    disponible (la dernière écriture, au plus tard l'entrée).
 *
 * Une colonne nulle se lit par repli sur `created_at` (`MaintenanceQueue::waitingSince`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('maintenance_requests', function (Blueprint $table) {
            $table->timestamp('status_changed_at')->nullable();
        });

        DB::statement(<<<'SQL'
            UPDATE maintenance_requests SET status_changed_at = CASE status
                WHEN 'open' THEN created_at
                WHEN 'quote_submitted' THEN COALESCE(quote_submitted_at, updated_at)
                WHEN 'approved' THEN COALESCE(quote_decision_at, updated_at)
                WHEN 'rejected' THEN COALESCE(quote_decision_at, updated_at)
                WHEN 'in_progress' THEN COALESCE(started_at, updated_at)
                WHEN 'completed' THEN COALESCE(completed_at, updated_at)
                ELSE updated_at
            END
            SQL);
    }

    public function down(): void
    {
        Schema::table('maintenance_requests', function (Blueprint $table) {
            $table->dropColumn('status_changed_at');
        });
    }
};
