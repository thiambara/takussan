<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Revue adverse n° 8 du 2026-11-04 (TCK-2472, ADR-0088 §2, amendement du même jour) — le SEUIL d'affichage d'une
 * recherche populaire compte les RÉSEAUX distincts du jour (/24 en IPv4, /48 en IPv6), pas les visiteurs : cinq
 * adresses d'un même /48 (une box reçoit couramment un /56, un hébergeur un /48) faisaient « cinq visiteurs
 * distincts », et poussaient une saisie dans les recherches populaires montrées à tous.
 *
 * `distinct_visitors` garde son sens (l'adresse IPv4, le /64 d'une IPv6) : c'est le compte. `distinct_networks` ne
 * sert qu'au seuil ; sous-compter y est le sens sûr. Comptés tous deux par `search_query_visitors`, chacun par sa
 * propre empreinte.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('search_query_stats', function (Blueprint $table) {
            $table->unsignedInteger('distinct_networks')->default(0)->after('distinct_visitors');
        });
    }

    public function down(): void
    {
        Schema::table('search_query_stats', function (Blueprint $table) {
            $table->dropColumn('distinct_networks');
        });
    }
};
