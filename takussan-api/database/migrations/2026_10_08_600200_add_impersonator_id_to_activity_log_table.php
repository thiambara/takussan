<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-600 (ADR-0055 §5) — l'opérateur qui impersonnait quand l'activité a été écrite. Renseigné par
 * `Activity::creating` depuis `ImpersonationContext` ; nul hors session.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table(config('activitylog.table_name', 'activity_log'), function (Blueprint $table) {
            $table->foreignId('impersonator_id')->nullable()
                ->constrained('users', 'id', 'activity_log_impersonator_fk')->nullOnDelete();
            $table->index('impersonator_id', 'activity_log_impersonator_idx');
        });
    }

    public function down(): void
    {
        Schema::table(config('activitylog.table_name', 'activity_log'), function (Blueprint $table) {
            $table->dropForeign('activity_log_impersonator_fk');
            $table->dropIndex('activity_log_impersonator_idx');
            $table->dropColumn('impersonator_id');
        });
    }
};
