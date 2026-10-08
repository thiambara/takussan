<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * TCK-589 — rattrapage : un numéro VÉRIFIÉ sur plusieurs comptes vivants empêche de créer
 * `users_phone_verified_unique`, posé par la migration suivante
 * (`2026_10_07_150200_make_email_nullable_and_phone_unique_on_users_table`).
 *
 * Mesuré le 2026-10-08 : le déploiement de la préproduction (`1fb32e3a`) est mort sur cet index,
 * `SQLSTATE[23505] could not create unique index`. La base peuplée portait des doublons que la
 * suite, partie d'une base vide, ne pouvait pas voir ; l'en-tête de l'index demandait de les relever
 * à la main avant de migrer. Ce rattrapage le fait à sa place, sur toute base. Son nom trie avant
 * celui de l'index : sur une base où l'index manque encore, il s'exécute d'abord.
 *
 * Règle : par forme canonique, le compte vérifié le plus RÉCEMMENT garde la vérification — la preuve
 * de détention la plus fraîche, un numéro se recyclant —, égalité départagée par l'id le plus grand.
 * Les autres perdent `phone_verified_at`, et rien d'autre : ni le numéro, ni le compte. Ils le
 * revérifient par le parcours ordinaire, qui répond `phone.taken` tant que l'autre le tient. La perte
 * coûte les canaux SMS et WhatsApp (gardés par `phone_verified_at`) et la connexion par téléphone ;
 * la 2FA est TOTP, elle n'en dépend pas.
 *
 * Le journal ne porte que des identifiants, jamais le numéro.
 */
return new class extends Migration
{
    /** L'expression de `users_phone_verified_unique`, recopiée : une migration ne suit pas le code. */
    private const CANONICAL_PHONE = "regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(phone, '[[:space:]().-]', '', 'g'), '^00', '+'), '^([0-9]+)\\+([0-9]{1,3})\$', '+\\2\\1'), '^(221[0-9]{9})\$', '+\\1'), '^([0-9]{9})\$', '+221\\1')";

    public function up(): void
    {
        $groupes = DB::select(
            'SELECT string_agg(id::text, \',\' ORDER BY phone_verified_at DESC, id DESC) AS ids FROM users '
            .'WHERE phone_verified_at IS NOT NULL AND deleted_at IS NULL '
            .'GROUP BY '.self::CANONICAL_PHONE.' HAVING count(*) > 1'
        );

        foreach ($groupes as $groupe) {
            $ids = explode(',', (string) $groupe->ids);
            $gardien = array_shift($ids);
            Log::warning('phone_verified_dedup', ['keeper' => (int) $gardien, 'unverified' => array_map('intval', $ids)]);
            DB::table('users')->whereIn('id', $ids)->update(['phone_verified_at' => null]);
        }
    }

    /**
     * Rien à défaire : rendre la vérification aux comptes écartés recréerait les doublons que
     * l'index interdit.
     */
    public function down(): void {}
};
