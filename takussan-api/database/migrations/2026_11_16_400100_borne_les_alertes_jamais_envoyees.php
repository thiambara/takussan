<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-615 (ADR-0050, amendement du 2026-11-16, B — décision du porteur) — le premier envoi d'une
 * alerte n'annonce plus l'historique. Les recherches neuves reçoivent leur borne à la création (ou à
 * la confirmation) ; une recherche existante jamais alertée (`last_notified_at` nul) reçoit sa date
 * de création, sans quoi la décision ne vaudrait que pour les recherches neuves. Une demande sans
 * compte encore en attente la reçoit aussi : sa confirmation la reposera.
 *
 * `saved_searches.last_notified_at` n'est lu par aucun index de recherche : rien à réimporter.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('saved_searches')->whereNull('last_notified_at')->update(['last_notified_at' => DB::raw('created_at')]);
    }

    /**
     * Sans effet, délibérément : quelles lignes étaient nulles n'est plus su, et une borne à la
     * création est exactement ce que la décision demande.
     */
    public function down(): void {}
};
