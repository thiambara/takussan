<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2866 — qui une alerte de seuil prévient, et par quel canal.
 *
 * - `recipient_ids` : un sous-ensemble des destinataires possibles de sa mesure
 *   (`ThresholdAlertRecipients::forMetric()`), choisi par l'admin ; `NULL` (ou vide) = tous, la règle
 *   d'avant. Une liste JSON d'identifiants de comptes, relue et re-jugée à chaque déclenchement.
 * - `channel` : `email`, `whatsapp` ou `both` — la cloche part toujours. Défaut `email` : la cloche et
 *   le courriel, ce que toute alerte existante faisait.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('threshold_alerts', function (Blueprint $table) {
            $table->jsonb('recipient_ids')->nullable();
            $table->string('channel', 16)->default('email');
        });
    }

    public function down(): void
    {
        Schema::table('threshold_alerts', function (Blueprint $table) {
            $table->dropColumn(['recipient_ids', 'channel']);
        });
    }
};
