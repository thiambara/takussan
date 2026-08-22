<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Indexe les trois colonnes `agency_id` qui n'en portaient aucune (TCK-343).
 *
 * ─── Pourquoi ces trois-là, et pas les 85 autres clés étrangères nues ──────────────
 *
 * PostgreSQL n'indexe PAS automatiquement une clé étrangère, là où InnoDB le faisait
 * (piège n°8 du `CLAUDE.md` racine). Mesuré le 2026-08-22 sur la base semée : le dépôt
 * porte **164 FK à une colonne, dont 88 sans index utilisable**.
 *
 * Les indexer en masse serait une erreur — chacun coûte à l'écriture, et l'écrasante
 * majorité ne sert jamais. Le tri retenu est celui-ci :
 *
 *   · **78 des 88 pointent vers un parent en SOFT DELETE.** `User` et 27 autres modèles
 *     portent `deleted_at` : `->delete()` y est un `UPDATE`, et **aucun contrôle de FK
 *     ne se déclenche**. Mesuré : `UPDATE users SET deleted_at = now()` → 0,456 ms, plan
 *     sans le moindre nœud `Trigger`. Leur `ON DELETE SET NULL` est du code mort tant
 *     que rien ne fait de suppression dure. *Indexer pour un `ON DELETE` qui ne se
 *     déclenche jamais, c'est payer l'écriture sans rien acheter.*
 *   · **10 ont un parent en suppression dure**, et le coût y est réel — mais l'opération
 *     ne figure NULLE PART dans `app/` (aucun site de suppression de
 *     `bank_statement_lines` ni de `platform_payouts`). Mesuré quand même, pour ne pas
 *     conclure d'une absence : supprimer une ligne de `bank_statement_lines` coûte
 *     1,124 ms dont **1,064 ms de contrôles de FK** (3 nœuds `Trigger`), ramenés à
 *     0,597 ms avec les index. Un gain de 0,5 ms sur une opération qui n'existe pas
 *     n'est pas un motif suffisant : ces index-là ne sont PAS créés.
 *   · **Restent les 3 colonnes `agency_id`** — et celles-ci se justifient par la
 *     LECTURE, pas par la suppression. L'agence est la frontière d'isolation : ces trois
 *     tables sont filtrées par agence à CHAQUE listage.
 *
 * ─── Pourquoi (agency_id, created_at) et non (agency_id) seul ─────────────────────
 *
 * Les trois contrôleurs combinent un filtre par agence et un tri par date :
 *
 *   · `PayoutController.php:37`      — `filter[agency_id]` exposé + `defaultSort('-created_at')`
 *   · `IntegrationController.php:23` — `where('agency_id', …)` FORCÉ + `:27` `defaultSort('-created_at')`
 *   · `InvitationController.php:153` — `where('agency_id', …)` FORCÉ + `:43` `defaultSort('-created_at')`
 *
 * L'index composite sert le `WHERE` **et** le `ORDER BY` : le `LIMIT 20` de la
 * pagination s'arrête après 21 entrées d'index au lieu de trier tout le lot de
 * l'agence. C'est là qu'est l'essentiel du gain, et non dans le filtre.
 *
 * L'ordre est ASC bien que le tri soit DESC : PostgreSQL parcourt un B-tree à l'envers
 * (`Index Scan Backward`) sans pénalité — mesuré à 0,060 ms contre 0,056 ms pour un
 * index explicitement DESC. Le constructeur de schéma de Laravel suffit donc, et on
 * évite un `DB::statement` brut.
 *
 * ─── ⚠ Le chiffre qui justifie ceci est une EXTRAPOLATION, et il faut le savoir ────
 *
 * **La base semée ne peut PAS trancher, pour deux raisons indépendantes** :
 *   1. elle ne contient que **4 agences** pour 2581 `payouts` — chaque agence est 25 %
 *      de la table, une sélectivité pour laquelle aucun index n'a d'intérêt ;
 *   2. `pg_stats` donne une **corrélation de 1,0** sur `payouts.agency_id` — le seed a
 *      inséré agence par agence, si bien qu'un `Index Scan` y lit un quart de table
 *      CONTIGU. En cassant l'ordre physique (copie `ORDER BY random()`, corrélation
 *      0,227), le gain apparent disparaît : 66 blocs contre 64 pour un `Seq Scan`.
 *
 * La mesure a donc été refaite sur une table de forme réaliste — **800 000 lignes,
 * 500 agences, ordre physique aléatoire** — où le listage par défaut passe de
 * **22,999 ms / 6068 blocs** (`Parallel Seq Scan`) à **0,060 ms / 27 blocs**
 * (`Index Scan Backward`). C'est une extrapolation assumée, pas une mesure de
 * production : *le seed est trop petit pour trancher, et le dire vaut mieux que de
 * conclure dans un sens ou dans l'autre.*
 *
 * Coût à l'écriture, mesuré sur ces 800 000 lignes : l'index composite pèse **11 Mo
 * pour 47 Mo de table (23 %)**, contre 5,7 Mo (12 %) pour un index sur `agency_id`
 * seul. Les trois tables visées sont à écriture faible (un virement, une intégration,
 * une invitation), jamais à écriture massive.
 */
return new class extends Migration
{
    /** @var list<array{0: string, 1: string}> table, nom d'index explicite */
    private const CIBLES = [
        ['payouts', 'payouts_agency_id_created_at_index'],
        ['integrations', 'integrations_agency_id_created_at_index'],
        ['invitations', 'invitations_agency_id_created_at_index'],
    ];

    public function up(): void
    {
        foreach (self::CIBLES as [$table, $index]) {
            Schema::table($table, function (Blueprint $t) use ($index): void {
                // Nom EXPLICITE : au-delà de 63 caractères PostgreSQL tronque avec un
                // simple NOTICE, et l'index existe alors sous un nom que Laravel ne
                // recalculera jamais — c'est le `dropIndex()` d'une migration future qui
                // casse. Les trois noms ci-dessus font 34 à 39 caractères.
                $t->index(['agency_id', 'created_at'], $index);
            });
        }
    }

    public function down(): void
    {
        foreach (self::CIBLES as [$table, $index]) {
            Schema::table($table, function (Blueprint $t) use ($index): void {
                $t->dropIndex($index);
            });
        }
    }
};
