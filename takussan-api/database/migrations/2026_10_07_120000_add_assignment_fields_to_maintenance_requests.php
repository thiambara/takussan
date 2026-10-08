<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-592 — l'acceptation du prestataire et le mot d'accès du donneur d'ordre.
 *
 * `accepted_at` n'est PAS un statut, et c'est délibéré : l'assignation ne change pas le statut, et
 * `assigned` n'a pas de chemin vers le devis dans l'ancienne table — faire de l'acceptation un état
 * aurait cassé le devis. `null` = assigné, pas encore accepté ; remis à `null` à chaque réassignation.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('maintenance_requests', function (Blueprint $table): void {
            $table->timestamp('accepted_at')->nullable()->after('assigned_to');
            $table->text('access_instructions')->nullable()->after('resolution_notes');
        });
    }

    public function down(): void
    {
        Schema::table('maintenance_requests', function (Blueprint $table): void {
            $table->dropColumn(['accepted_at', 'access_instructions']);
        });
    }
};
