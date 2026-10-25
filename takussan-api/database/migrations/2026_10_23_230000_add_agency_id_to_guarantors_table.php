<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-1993 (P175.01) — l'agence d'une caution, posée à sa création.
 *
 * Elle ne se lisait que par son auteur (`addedBy->agency_id`) : une caution dont l'auteur efface son
 * compte n'était plus lisible par personne dans l'agence. Colonne nullable : une caution ajoutée hors
 * de toute agence n'en a pas.
 *
 * Rattrapage, dans cet ordre, et seulement quand la source désigne UNE agence :
 *   1. l'agence des baux qui la portent (`leases.guarantor_id` ou le pivot `lease_guarantor`) ;
 *   2. sinon l'agence des profils de son auteur (agent, admin d'agence, bailleur), profils supprimés
 *      en douceur compris : c'est le cas même que la colonne répare.
 * Un auteur présent dans plusieurs agences, sans bail, laisse la colonne nulle — la règle de
 * l'accesseur `User::agency_id`, qui rend `null` dans ce cas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('guarantors', function (Blueprint $table) {
            $table->foreignId('agency_id')->nullable()->after('added_by_id')
                ->constrained('agencies')->nullOnDelete();
            $table->index('agency_id');
        });

        DB::statement(<<<'SQL'
            UPDATE guarantors g SET agency_id = src.agency_id
            FROM (
                SELECT guarantor_id, MIN(agency_id) AS agency_id
                FROM (
                    SELECT guarantor_id, agency_id FROM leases WHERE guarantor_id IS NOT NULL AND agency_id IS NOT NULL
                    UNION
                    SELECT lg.guarantor_id, l.agency_id FROM lease_guarantor lg JOIN leases l ON l.id = lg.lease_id
                    WHERE l.agency_id IS NOT NULL
                ) baux
                GROUP BY guarantor_id
                HAVING COUNT(DISTINCT agency_id) = 1
            ) src
            WHERE g.id = src.guarantor_id AND g.agency_id IS NULL
        SQL);

        DB::statement(<<<'SQL'
            UPDATE guarantors g SET agency_id = src.agency_id
            FROM (
                SELECT user_id, MIN(agency_id) AS agency_id
                FROM (
                    SELECT user_id, agency_id FROM agent_profiles WHERE agency_id IS NOT NULL
                    UNION
                    SELECT user_id, agency_id FROM agency_admin_profiles WHERE agency_id IS NOT NULL
                    UNION
                    SELECT user_id, agency_id FROM owner_profiles WHERE agency_id IS NOT NULL
                ) profils
                GROUP BY user_id
                HAVING COUNT(DISTINCT agency_id) = 1
            ) src
            WHERE g.added_by_id = src.user_id AND g.agency_id IS NULL
        SQL);
    }

    public function down(): void
    {
        Schema::table('guarantors', function (Blueprint $table) {
            $table->dropForeign(['agency_id']);
            $table->dropIndex(['agency_id']);
            $table->dropColumn('agency_id');
        });
    }
};
