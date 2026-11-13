<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2766 — le canal du dernier contact d'une fiche client (`LastContactChannel` : les quatre
 * gestes, `note`, `visit`), écrit par la même requête que `last_contacted_at`
 * (`ContactGestureService::touchCustomer()`), donc jamais en désaccord avec elle. Chaîne sans
 * `enum()` SQL (ADR-0007). Aucune reprise de l'existant : une fiche déjà contactée garde `null`
 * jusqu'à son prochain contact (le journal ne connaît le canal que des gestes, jamais des notes ni
 * des visites ; une reprise partielle mêlerait deux vérités).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('last_contact_channel', 16)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('last_contact_channel');
        });
    }
};
