<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2917 (ADR-0118 § 1) — le motif que donne qui annule une intervention par `PUT …/status`, lu par
 * le demandeur, le bailleur, le prestataire et le personnel. Écrit par
 * `MaintenanceRequestService::transition()` sous verrou ; nul pour une annulation du système.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('maintenance_requests', function (Blueprint $table) {
            $table->text('cancellation_reason')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('maintenance_requests', function (Blueprint $table) {
            $table->dropColumn('cancellation_reason');
        });
    }
};
