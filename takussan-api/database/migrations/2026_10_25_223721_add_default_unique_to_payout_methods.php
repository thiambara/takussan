<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2372 (P250.03, décision du porteur du 2026-10-25) — un compte n'a qu'une destination de
 * reversement VIVANTE par défaut, et la base le garantit.
 *
 * `PayoutMethodService` tenait la règle en lisant puis en écrivant, sans verrou : deux ajouts
 * simultanés pouvaient laisser deux `is_default`, et `PayoutService::defaultVerifiedDestination`
 * en prenait une par `->first()` sans ordre.
 *
 * `deleted_at IS NULL` en plus de `is_default` : la table est en `SoftDeletes`, et une destination
 * supprimée garde son `is_default`. Sans la clause, ajouter une destination après avoir supprimé
 * celle par défaut heurtait l'index.
 *
 * ⚠ Une donnée existante ne change jamais en silence : face à des doublons, la migration ÉCHOUE en
 * les nommant, et ne retire le défaut d'aucune destination. Choisir celle où part l'argent
 * appartient au titulaire, pas à une migration.
 *
 * Laravel n'exprime pas un index partiel : SQL brut, PostgreSQL (ADR-0020).
 */
return new class extends Migration
{
    public function up(): void
    {
        $doublons = DB::select(<<<'SQL'
            SELECT user_id, string_agg(id::text, ', ' ORDER BY id) AS ids
            FROM payout_methods
            WHERE is_default AND deleted_at IS NULL
            GROUP BY user_id
            HAVING count(*) > 1
            ORDER BY user_id
            SQL);

        if ($doublons !== []) {
            throw new RuntimeException(sprintf(
                'payout_methods : comptes portant plus d\'une destination vivante par défaut : %d '
                .'(%s). Rien n\'a été modifié : faire choisir au titulaire sa destination par défaut, '
                .'retirer le défaut des autres, puis rejouer la migration.',
                count($doublons),
                implode(' ; ', array_map(fn (object $d) => "user_id {$d->user_id} : destinations {$d->ids}", $doublons)),
            ));
        }

        DB::statement(
            'CREATE UNIQUE INDEX payout_methods_user_default_unique ON payout_methods '
            .'(user_id) WHERE is_default AND deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS payout_methods_user_default_unique');
    }
};
