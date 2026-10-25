<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * P179.01 (TCK-2155, décision du porteur du 2026-10-24) — le compte des essais du rappel
 * automatique d'une invitation (`InvitationService::remindPending()`). `last_reminded_at` porte
 * la date du dernier essai ; un SMS refusé par tous les fournisseurs se retente un jour plus tard,
 * trois essais au plus. Un rappel posé épuise le compte (`MAX_REMINDER_ATTEMPTS`).
 *
 * Ajout seul, défaut 0 : une invitation déjà rappelée (`last_reminded_at` posé, compte 0) reste
 * tenue pour rappelée, aucune ligne n'est réécrite.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invitations', function (Blueprint $table) {
            $table->unsignedSmallInteger('reminder_attempts')->default(0)->after('last_reminded_at');
        });
    }

    public function down(): void
    {
        Schema::table('invitations', function (Blueprint $table) {
            $table->dropColumn('reminder_attempts');
        });
    }
};
