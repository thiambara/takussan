<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-601 (ADR-0044 §3) — l'agence d'une ligne du journal, résolue depuis son SUJET à l'écriture
 * (`App\Services\Audit\AuditAgencyResolver`). Nullable : une ligne sans agence résolue n'est
 * visible que du super-admin. `nullOnDelete` : supprimer une agence ne supprime pas son histoire.
 *
 * Deux index : le journal d'une agence se lit par date (`agency_id, created_at`), et l'audit
 * plateforme comme les exports filtrent par période seule (`created_at`), sans index jusqu'ici.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_log', function (Blueprint $table): void {
            $table->foreignId('agency_id')->nullable()->after('causer_id')
                ->constrained('agencies', 'id', 'activity_log_agency_fk')->nullOnDelete();
            $table->index(['agency_id', 'created_at'], 'activity_log_agency_created_idx');
            $table->index('created_at', 'activity_log_created_idx');
        });
    }

    public function down(): void
    {
        Schema::table('activity_log', function (Blueprint $table): void {
            $table->dropIndex('activity_log_created_idx');
            $table->dropIndex('activity_log_agency_created_idx');
            $table->dropForeign('activity_log_agency_fk');
            $table->dropColumn('agency_id');
        });
    }
};
