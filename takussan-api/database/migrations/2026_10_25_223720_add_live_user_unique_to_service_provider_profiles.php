<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2372 (P250.02, décision du porteur du 2026-10-25) — un compte n'a qu'un profil de prestataire
 * VIVANT, et la base le garantit.
 *
 * La règle (TCK-2280, ADR-0016, amendement du 2026-10-25) ne tenait que par
 * `InvitationService::assertDraftDoesNotDuplicateAProfile`, un `exists()` lu avant de poser
 * `user_id`, sans verrou : deux acceptations simultanées le passaient toutes deux. L'unicité de la
 * création (`service_provider_profiles_user_id_unique`) avait été retirée par `2026_05_10_170000`
 * pour laisser coexister les brouillons, qui naissent sans compte : d'où l'index PARTIEL, sur le
 * patron de `integrations_provider_agency_live_unique`. Un profil supprimé (`SoftDeletes`) ne
 * compte pas.
 *
 * ⚠ Une donnée existante ne change jamais en silence : face à des doublons, la migration ÉCHOUE en
 * les nommant, et ne fusionne ni ne supprime rien. Choisir le profil qui reste (ses collaborations,
 * ses interventions, ses pièces) est une décision, pas une migration.
 *
 * Laravel n'exprime pas un index partiel : SQL brut, PostgreSQL (ADR-0020).
 */
return new class extends Migration
{
    public function up(): void
    {
        $doublons = DB::select(<<<'SQL'
            SELECT user_id, string_agg(id::text, ', ' ORDER BY id) AS ids
            FROM service_provider_profiles
            WHERE user_id IS NOT NULL AND deleted_at IS NULL
            GROUP BY user_id
            HAVING count(*) > 1
            ORDER BY user_id
            SQL);

        if ($doublons !== []) {
            throw new RuntimeException(sprintf(
                'service_provider_profiles : comptes portant plus d\'un profil de prestataire vivant : %d '
                .'(%s). Rien n\'a été modifié : choisir le profil qui reste, supprimer les autres, puis '
                .'rejouer la migration.',
                count($doublons),
                implode(' ; ', array_map(fn (object $d) => "user_id {$d->user_id} : profils {$d->ids}", $doublons)),
            ));
        }

        DB::statement(
            'CREATE UNIQUE INDEX service_provider_profiles_user_live_unique ON service_provider_profiles '
            .'(user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS service_provider_profiles_user_live_unique');
    }
};
