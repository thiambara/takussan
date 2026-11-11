<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2669 (ADR-0104 § 5) — une demande de passage peut reprendre la dernière demande REFUSÉE de
 * son agence : `resubmit_of_id` la désigne. Les champs absents de la reprise, dont le NINEA et le
 * RIB masqués à la lecture, en sont recopiés côté serveur.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agency_upgrade_requests', function (Blueprint $table) {
            $table->foreignId('resubmit_of_id')->nullable()
                ->constrained('agency_upgrade_requests', 'id', 'agency_upgrade_requests_resubmit_of_fk')
                ->nullOnDelete();
            $table->index('resubmit_of_id', 'agency_upgrade_requests_resubmit_of_idx');
        });
    }

    public function down(): void
    {
        Schema::table('agency_upgrade_requests', function (Blueprint $table) {
            $table->dropIndex('agency_upgrade_requests_resubmit_of_idx');
            $table->dropForeign('agency_upgrade_requests_resubmit_of_fk');
            $table->dropColumn('resubmit_of_id');
        });
    }
};
