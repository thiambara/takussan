<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2591 (ADR-0103 § 5) — l'heure de confirmation d'une visite. « Visite confirmée » est le
 * premier fait qui propose une étape du pipeline (Prospect), et il doit être DATÉ : la
 * proposition ne retient que les faits postérieurs au dernier changement d'étape. Rien ne le
 * datait — `updated_at` bouge à chaque retouche (§ 6 l'écarte), et `status = confirmed` cesse
 * d'être vrai quand la visite se termine.
 *
 * Posée par le modèle à chaque passage en `confirmed` (`PropertyVisit::performInsert/Update`),
 * y compris sous `withoutEvents()`.
 *
 * Reprise : une visite aujourd'hui `confirmed` reçoit son `updated_at` — la meilleure trace
 * disponible, et la seule écriture qu'une confirmation garantisse. Une visite terminée, annulée
 * ou manquée n'en reçoit pas : rien ne dit qu'elle a été confirmée, ni quand. `down()` retire la
 * colonne, données comprises.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('property_visits', function (Blueprint $table) {
            $table->timestamp('confirmed_at')->nullable();
        });

        DB::table('property_visits')
            ->where('status', 'confirmed')
            ->whereNull('confirmed_at')
            ->update(['confirmed_at' => DB::raw('updated_at')]);
    }

    public function down(): void
    {
        Schema::table('property_visits', function (Blueprint $table) {
            $table->dropColumn('confirmed_at');
        });
    }
};
