<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2583 (ADR-0103 § 1) — le dernier contact d'une fiche client : un geste (appel, WhatsApp,
 * e-mail, SMS), une note, une visite terminée ou un compte rendu. Tenu par `ContactGestureService`
 * seul. Indexé avec l'agence : les relances dues (`crm.follow_up_days`, TCK-2588) se lisent par
 * agence, sur cette colonne.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->timestamp('last_contacted_at')->nullable();
            $table->index(['agency_id', 'last_contacted_at'], 'customers_agency_last_contacted_idx');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropIndex('customers_agency_last_contacted_idx');
            $table->dropColumn('last_contacted_at');
        });
    }
};
