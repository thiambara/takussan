<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Pose enfin en BASE l'invariant que la spec exige depuis TCK-279 : « exactement un rôle
 * système par (agency_id, base_profile_type) ».
 *
 * ─── Pourquoi il n'y était pas, et pourquoi la raison est périmée ──────────────────
 *
 * `2026_08_16_120000_create_agency_roles_table` l'expliquait ainsi : *« la contrainte
 * […] est un unique PARTIEL (`WHERE is_system = true`), que MySQL 8.0 ne sait pas
 * exprimer. Elle est tenue applicativement par `AgencySystemRoleSeeder` […] et par
 * `AgencyRolePolicy` »*.
 *
 * C'était vrai de MySQL. Depuis [ADR-0020](../../../docs/adr/0020-postgresql-sur-tous-les-environnements.md)
 * il n'y a plus qu'un moteur, PostgreSQL 17, **qui sait parfaitement l'exprimer** — le
 * dépôt en pose d'ailleurs déjà un : `agency_upgrade_requests_one_pending_per_agency`,
 * dans `2026_05_10_180000`.
 *
 * > *Une justification périmée protège le code qu'elle décrit : on cesse de se demander
 * > s'il est encore nécessaire.* La raison a survécu six jours au moteur qui la portait,
 * > et elle aurait pu y survivre des années — rien ne l'aurait signalé.
 *
 * ─── Ce que la couche applicative NE couvrait PAS ──────────────────────────────────
 *
 * Le seeder est idempotent, et `AgencyRolePolicy` interdit de créer un rôle système par
 * l'API. Les deux tiennent le COMPORTEMENT. Ce qu'ils ne voient pas : un
 * `DB::table()->insert()`, un seeder de démonstration, une commande de reprise, un
 * import, un `updateQuietly`.
 *
 * *La normalisation applicative garde le comportement ; l'index garde les données.*
 * C'est le même raisonnement, mot pour mot, que celui de `2026_08_21_130000` sur
 * `users.email` — et c'est une raison d'ajouter cette couche, pas de retirer l'autre.
 *
 * Le test qui l'éprouve écrit donc en SQL brut :
 * `AgencySeedSystemRolesTest::test_un_second_role_systeme_du_meme_type_est_refuse_par_la_base`.
 * Il échouait avant cette migration. Le test voisin,
 * `test_exactly_one_system_role_per_base_type`, ne pouvait pas l'attraper : il rappelle
 * `seed()` et compte — c'est-à-dire qu'il éprouve le seul chemin qui ne viole jamais
 * l'invariant.
 *
 * ─── PARTIEL, et c'est le point qui compte ────────────────────────────────────────
 *
 * `WHERE is_system` ne contraint QUE les rôles système. Deux rôles PERSONNALISÉS du même
 * type de base sont légitimes — c'est tout l'objet de la phase 2 de TCK-279 — et un
 * index total les refuserait. *Une contrainte trop large ne se voit pas en vert : elle
 * se voit le jour où quelqu'un a besoin du cas qu'elle interdit.*
 * `test_deux_roles_personnalises_du_meme_type_restent_permis` épingle ce versant.
 *
 * ─── Si cette migration ÉCHOUE ─────────────────────────────────────────────────────
 *
 * C'est qu'une agence porte déjà deux rôles système du même type. Les nommer :
 *
 *     SELECT agency_id, base_profile_type, count(*), array_agg(id)
 *     FROM agency_roles WHERE is_system GROUP BY 1, 2 HAVING count(*) > 1;
 *
 * Relevé le 2026-08-22 sur la base de développement : 0 groupe en double. **Ne pas
 * désamorcer la migration pour la faire passer** — un doublon ici veut dire que des
 * profils pointent vers deux rôles censés être le même, et c'est un arbitrage, pas un
 * nettoyage.
 */
return new class extends Migration
{
    /**
     * 42 caractères (mesuré) — sous la limite de 63 de PostgreSQL, qui ne refuse pas un
     * nom trop long mais le TRONQUE avec un simple `NOTICE`. Nom explicite plutôt que
     * calculé : le constructeur de schéma de Laravel ne sait pas exprimer un index
     * partiel, donc rien ici n'est engendré.
     */
    private const INDEX = 'agency_roles_one_system_role_per_base_type';

    public function up(): void
    {
        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX agency_roles_one_system_role_per_base_type
            ON agency_roles (agency_id, base_profile_type)
            WHERE is_system
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS '.self::INDEX);
    }
};
