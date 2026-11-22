<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2652, suite — `waiting_since` est l'entrée dans la FILE courante, plus dans le statut (décision
 * de la session du 2026-11-11). `MaintenanceRequestService::assign()` ne change pas le statut : un
 * dispatch, une réassignation ou un refus du prestataire changent le destinataire (`waiting_on`) sans
 * changer le statut, et l'ancienneté doit repartir de là. La colonne change de sens, elle change de
 * nom : `status_changed_at` → `queue_entered_at`. Le modèle la pose quand `status` OU `assigned_to`
 * change (`MaintenanceRequest::booted()`).
 *
 * **Rétro-remplissage.** Seules les demandes `open` AVEC prestataire changent : la migration
 * précédente leur donnait `created_at` (« jamais quitté son premier statut »), alors qu'elles sont
 * entrées dans la file du prestataire au dispatch. L'instant du dispatch n'est écrit nulle part ;
 * `updated_at` (la dernière écriture, au plus tard le dispatch) est la meilleure borne. Les autres
 * statuts avec prestataire avaient déjà une colonne du geste ou `updated_at`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('maintenance_requests', function (Blueprint $table) {
            $table->renameColumn('status_changed_at', 'queue_entered_at');
        });

        DB::statement(<<<'SQL'
            UPDATE maintenance_requests SET queue_entered_at = updated_at
            WHERE status = 'open' AND assigned_to IS NOT NULL
            SQL);
    }

    public function down(): void
    {
        DB::statement(<<<'SQL'
            UPDATE maintenance_requests SET queue_entered_at = created_at
            WHERE status = 'open' AND assigned_to IS NOT NULL
            SQL);

        Schema::table('maintenance_requests', function (Blueprint $table) {
            $table->renameColumn('queue_entered_at', 'status_changed_at');
        });
    }
};
