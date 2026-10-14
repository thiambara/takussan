<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-639 — passe 012 de `/sync-specs` : sept clés étrangères du lot TCK-633 sans index.
 *
 * Toutes sont en `ON DELETE SET NULL`. PostgreSQL n'indexe pas une clé étrangère de lui-même
 * (piège n°8 de `takussan-api/CLAUDE.md`) : sans index, chaque suppression d'un utilisateur, d'un
 * lot ou d'une offre parcourt la table enfant entière pour trouver les lignes à mettre à NULL.
 * La lecture qui en coûte est donc celle du moteur, pas une requête applicative — c'est ce qui
 * distingue ces colonnes de `taggables.attached_by_id`, laissée sans index faute de lecture.
 *
 * Un index par clé, sur sa seule colonne, sous un nom explicite (convention des migrations de
 * TCK-633). Relevé avant écriture, `pg_indexes` : aucun index existant n'avait l'une de ces
 * colonnes en tête — `credit_movements_boost_idx`, `credit_movements_lot_idx` et
 * `credit_welcome_grants_agency_unique` servent déjà les trois autres clés `nullOnDelete` du lot.
 * Index posés sans `CONCURRENTLY` : tables nées le 2026-10-12, et l'API n'a jamais servi en
 * production.
 */
return new class extends Migration
{
    /** @var array<string, array<string, string>> table => [colonne => nom de l'index] */
    private const INDEX = [
        'property_boosts' => [
            'boost_product_id' => 'property_boosts_product_idx',
            'purchased_by_id' => 'property_boosts_purchased_by_idx',
            'cancelled_by_id' => 'property_boosts_cancelled_by_idx',
        ],
        'credit_lots' => [
            'granted_by_id' => 'credit_lots_granted_by_idx',
        ],
        'credit_movements' => [
            'actor_id' => 'credit_movements_actor_idx',
        ],
        'credit_welcome_grants' => [
            'user_id' => 'credit_welcome_grants_user_idx',
            'credit_lot_id' => 'credit_welcome_grants_lot_idx',
        ],
    ];

    public function up(): void
    {
        foreach (self::INDEX as $table => $index) {
            Schema::table($table, function (Blueprint $blueprint) use ($index) {
                foreach ($index as $colonne => $nom) {
                    $blueprint->index($colonne, $nom);
                }
            });
        }
    }

    public function down(): void
    {
        foreach (self::INDEX as $table => $index) {
            Schema::table($table, function (Blueprint $blueprint) use ($index) {
                foreach ($index as $nom) {
                    $blueprint->dropIndex($nom);
                }
            });
        }
    }
};
