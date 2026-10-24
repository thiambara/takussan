<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2062 (P160.05, ADR-0043 amendement du 2026-10-23) — l'index d'unicité des avis porte le sujet
 * noté (`reviewable_id`).
 *
 * `reviews_author_context_uniq (author_id, reviewable_type, context_type, context_id)` n'admettait,
 * pour un même auteur et un même bail, qu'un avis de cible `User` : or l'agent du bail et un
 * collaborateur sont tous deux notables sur la même preuve, et le second avis heurtait l'index (500).
 *
 * Le nouvel index est strictement plus large : toute ligne qui respectait l'ancien le respecte, aucune
 * donnée ne bouge. Il est créé avant que l'ancien soit retiré.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE UNIQUE INDEX reviews_author_subject_context_uniq ON reviews (author_id, reviewable_type, reviewable_id, context_type, context_id) WHERE context_id IS NOT NULL');
        DB::statement('DROP INDEX IF EXISTS reviews_author_context_uniq');
    }

    /**
     * Recrée l'ancien index. Refuse, en le disant, si un auteur a déjà noté deux sujets de même type
     * sur une même preuve : revenir en arrière ne supprime aucun avis.
     */
    public function down(): void
    {
        $conflicts = DB::table('reviews')
            ->whereNotNull('context_id')
            ->groupBy('author_id', 'reviewable_type', 'context_type', 'context_id')
            ->havingRaw('COUNT(*) > 1')
            ->select('author_id', 'reviewable_type', 'context_type', 'context_id')
            ->get();

        if ($conflicts->isNotEmpty()) {
            throw new RuntimeException(sprintf(
                'reviews_author_context_uniq ne peut pas être recréé : %d auteur(s) ont noté plusieurs sujets sur une même preuve (TCK-2062). Aucun avis n\'est supprimé pour revenir en arrière.',
                $conflicts->count(),
            ));
        }

        DB::statement('CREATE UNIQUE INDEX reviews_author_context_uniq ON reviews (author_id, reviewable_type, context_type, context_id) WHERE context_id IS NOT NULL');
        DB::statement('DROP INDEX IF EXISTS reviews_author_subject_context_uniq');
    }
};
