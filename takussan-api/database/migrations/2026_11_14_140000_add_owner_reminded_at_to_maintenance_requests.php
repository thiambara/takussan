<?php

use App\Services\Maintenance\OwnerReminder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2786 — la dernière relance du bailleur d'une intervention en `awaiting_owner`
 * (`POST /api/maintenance-requests/{id}/owner-reminders`), écrite sous le verrou de la ligne par
 * {@see OwnerReminder}. Elle borne la cadence (une relance par 24 h) et
 * se lit « Relancé il y a … ». Aucune reprise : une demande déjà chez le bailleur n'a jamais été
 * relancée par Takussan, `null` le dit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('maintenance_requests', function (Blueprint $table) {
            $table->timestamp('owner_reminded_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('maintenance_requests', function (Blueprint $table) {
            $table->dropColumn('owner_reminded_at');
        });
    }
};
