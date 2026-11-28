<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-3006 (ADR-0138) — reprise de données : une caution sans agence prend celle de son auteur,
 * quand il n'en a qu'UNE.
 *
 * `CautionsLisibles` ne lit plus que la colonne `guarantors.agency_id`. Avant, la fiche retombait sur
 * l'agence de l'auteur (`addedBy->agency_id`) quand la colonne était nulle. Des lignes nulles existent
 * en préproduction et peuvent encore s'écrire : `GuarantorController::store` pose
 * `staffAgencyId() ?? agency_id`, qui rend `null` pour un auteur sans profil actif dans une agence
 * unique. La reprise de TCK-1993 (`2026_10_23_230000`) n'a rattaché que les lignes existant à cette
 * date. Sans cette reprise, le personnel de l'agence perdrait la lecture de ces cautions.
 *
 * La source reproduit le repli retiré, pas plus : l'accesseur `User::agency_id` hors requête, soit
 * l'agence des profils d'agence ACTIFS de l'auteur (agent, admin d'agence, bailleur ; statut `active`,
 * non supprimés), seulement s'ils désignent une seule agence. Un auteur de plusieurs agences, parti
 * ou suspendu laisse la colonne nulle, comme le repli la laissait sans lecteur d'agence. Une ligne
 * qui a déjà son agence n'est pas touchée.
 *
 * `guarantors` n'est pas indexé par Scout : aucune réimportation n'est nécessaire.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            UPDATE guarantors g SET agency_id = src.agency_id
            FROM (
                SELECT user_id, MIN(agency_id) AS agency_id
                FROM (
                    SELECT user_id, agency_id FROM agent_profiles
                    WHERE agency_id IS NOT NULL AND status = 'active' AND deleted_at IS NULL
                    UNION
                    SELECT user_id, agency_id FROM agency_admin_profiles
                    WHERE agency_id IS NOT NULL AND status = 'active' AND deleted_at IS NULL
                    UNION
                    SELECT user_id, agency_id FROM owner_profiles
                    WHERE agency_id IS NOT NULL AND status = 'active' AND deleted_at IS NULL
                ) profils
                GROUP BY user_id
                HAVING COUNT(DISTINCT agency_id) = 1
            ) src
            WHERE g.added_by_id = src.user_id AND g.agency_id IS NULL
        SQL);
    }

    /**
     * Sans retour, délibérément : rien ne distingue une ligne rattachée ici d'une ligne posée à la
     * création, et la remettre à `null` ôterait la lecture au personnel de l'agence, que le code
     * de cette version ne donne plus que par la colonne.
     */
    public function down(): void {}
};
