<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Performance audit follow-up. The dominant access pattern on these growing
 * transactional tables is "scope by agency_id, filter by status, sort by a
 * date column". Previously:
 *   - bookings/leases/invoices had no leading-agency_id composite, so the
 *     agency-scoped + status-filtered list could not be served by one index;
 *   - the user-facing `sort=` date columns (start_date/end_date/issue_date/
 *     due_date) were unindexed, forcing a filesort that degrades as rows grow.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->index(['agency_id', 'status']);
            $table->index('start_date');
            $table->index('end_date');
        });

        Schema::table('leases', function (Blueprint $table): void {
            $table->index(['agency_id', 'status']);
            $table->index('start_date');
            $table->index('end_date');
        });

        Schema::table('invoices', function (Blueprint $table): void {
            $table->index(['agency_id', 'status']);
            $table->index('issue_date');
            $table->index('due_date');
        });
    }

    /**
     * Le retour lâche la FK `agency_id` AVANT de retirer l'index composite, puis la repose.
     *
     * Sans ce détour, MySQL refuse : `SQLSTATE[HY000] 1553 — Cannot drop index
     * 'bookings_agency_id_status_index': needed in a foreign key constraint`. Mesuré le 2026-08-12
     * sur MariaDB 11.4, sur les trois tables — puis rejoué sur **MySQL 8.0**, le moteur réel de la
     * production, quand celui du banc d'essai a été corrigé le 2026-08-13 (ardoise D-43).
     * Le comportement d'InnoDB décrit ci-dessous est le même sur les deux.
     *
     * La raison n'est pas évidente et vaut d'être écrite. La colonne est née
     * `foreignId('agency_id')->nullable()->constrained('agencies')->nullOnDelete()`, ce qui laisse
     * InnoDB créer l'index qui back la contrainte. En posant `(agency_id, status)` — dont
     * `agency_id` est le préfixe gauche —, `up()` rend cet index auto redondant, et InnoDB le
     * retire : le composite devient **le seul** index de la FK. Le `down()` essaie donc de
     * supprimer le support de la contrainte, et se le voit refuser.
     *
     * C'était le piège n°2 du `CLAUDE.md` d'alors (« dropUnique/dropIndex sur une colonne portant
     * une FK »). Il était invisible : la CI tournait sur SQLite, qui accepte tout, et **aucun
     * `down()` n'est jamais exécuté par la suite de tests**. Le job `migrations-pgsql` de
     * `api-ci.yml` (ex-`migrations-mysql`) le rejoue à chaque PR — il a trouvé celui-ci à sa
     * première exécution.
     *
     * ⚠ Depuis ADR-0020 (PostgreSQL 17 partout), ce piège a DISPARU dans les deux sens, et le
     * détour ci-dessous est devenu inutile sans devenir faux : PostgreSQL n'indexe PAS
     * automatiquement une clé étrangère, donc rien n'y refuse un `dropIndex`. C'est le piège n°8
     * du `CLAUDE.md` actuel, qui est la contrepartie de celui-ci — plus rien ne refuse un
     * `dropIndex`, et plus rien ne sert les requêtes gratuitement. Le `down()` n'est pas réécrit :
     * il est joué en CI, il passe, et défaire une précaution qui ne coûte rien sur une migration
     * déjà appliquée n'achète aucune sûreté.
     */
    public function down(): void
    {
        foreach ([
            'bookings' => ['start_date', 'end_date'],
            'leases' => ['start_date', 'end_date'],
            'invoices' => ['issue_date', 'due_date'],
        ] as $table => $colonnesDate) {
            Schema::table($table, function (Blueprint $blueprint) use ($colonnesDate): void {
                $blueprint->dropForeign(['agency_id']);
                $blueprint->dropIndex(['agency_id', 'status']);
                foreach ($colonnesDate as $colonne) {
                    $blueprint->dropIndex([$colonne]);
                }
                // Reposée à l'identique de la migration de création : nullable + nullOnDelete.
                // Sous InnoDB, l'index de support était recréé avec elle et on retrouvait l'état
                // d'avant ; PostgreSQL, lui, n'en crée aucun — la FK est reposée nue. Ce n'est pas
                // une régression de ce `down()` : c'est le piège n°8 du `CLAUDE.md`, et il vaut
                // pour les 177 FK du dépôt, à indexer par mesure (`EXPLAIN`) et non en masse.
                $blueprint->foreign('agency_id')->references('id')->on('agencies')->nullOnDelete();
            });
        }
    }
};
