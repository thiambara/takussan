<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Rend leur SENS aux trois index que `2026_08_21_130000` croyait avoir rendu insensibles
 * à la casse ([ADR-0025](../../../docs/adr/0025-repli-de-casse-par-collation-icu.md)).
 *
 * ─── Le défaut, et pourquoi il ne rougissait nulle part ────────────────────────────
 *
 * `lower()` emprunte la collation de son argument. Sous `--locale=C` (ADR-0020), elle ne
 * replie que l'ASCII A-Z. Mesuré le 2026-08-22 sur le conteneur :
 *
 *     SELECT lower('CAFÉ'), lower('CAFÉ') = lower('Café');   →  cafÉ | f
 *     SELECT lower('DAKAR') = lower('Dakar');                →  t
 *
 * L'index dont la raison d'être ENTIÈRE est de refuser les variantes de casse laissait
 * donc passer `CAFÉ` à côté de `Café`. Prouvé par ablation sur une base jetable portant
 * l'index EXACT de la migration précédente, AVANT d'écrire une ligne de correctif :
 * `INSERT 'Dakar'` puis `'DAKAR'` → refusé ; `'Café'` puis `'CAFÉ'` → **accepté**.
 *
 * **Et la suite ne pouvait pas le voir** : `CaseInsensitiveUniquenessTest` employait
 * `'Dakar'` et `strtoupper()`, qui est ASCII-only en PHP. *Un test dont la donnée évite
 * le cas limite ne garde pas la règle, il garde l'exemple.* Les trois jeux de données
 * non-ASCII ajoutés dans ce commit échouaient avant cette migration.
 *
 * ─── Ce que cette migration NE restaure PAS, et c'est la reconduction d'ADR-0020 ────
 *
 * **L'insensibilité aux ACCENTS.** `Café` et `Cafe` restent deux valeurs distinctes, et
 * c'est voulu : *« `José` et `Jose` sont deux adresses e-mail DIFFÉRENTES »*
 * (`2026_08_21_130000`). La restaurer exigerait `unaccent`, qu'ADR-0020 §2 refuse
 * d'installer sans ticket. Vérifié plutôt que supposé :
 * `lower('CAFÉ' COLLATE "und-x-icu") = 'cafe'` → `f`.
 *
 * ─── `und-x-icu` et pas une locale de pays ─────────────────────────────────────────
 *
 * Le repli de casse est LOCALISÉ. Mesuré : `lower('ISTANBUL' COLLATE "tr-x-icu")` rend
 * `ıstanbul`, avec un i sans point. Choisir une locale nationale ferait dépendre
 * l'unicité d'une table de la langue supposée de ses données. `und` est la locale
 * racine, et elle est déterministe (`collisdeterministic` → `t`), donc `LIKE` reste
 * possible sur l'expression — ce qui est la contrainte dure d'ADR-0020.
 *
 * ─── ⚠ L'INDEX SEUL NE SUFFIT PAS ─────────────────────────────────────────────────
 *
 * Une requête doit écrire EXACTEMENT l'expression de l'index pour l'emprunter. Mesuré
 * sur 5000 lignes :
 *
 *     WHERE LOWER(name COLLATE "und-x-icu") = ?   →  Index Scan
 *     WHERE LOWER(name) = ?                       →  Seq Scan
 *
 * Les six sites applicatifs qui écrivaient `LOWER(col) = ?` sont donc corrigés dans le
 * même commit. *Changer l'index sans changer les requêtes échange un défaut de
 * correction contre un défaut de performance, tous deux muets.*
 *
 * ─── Si cette migration ÉCHOUE ─────────────────────────────────────────────────────
 *
 * C'est qu'un doublon de casse existe déjà en base — et c'est le comportement voulu :
 * un doublon est une donnée à arbitrer, pas à écraser en silence. La requête qui les
 * nomme :
 *
 *     SELECT lower(name COLLATE "und-x-icu") AS k, count(*), array_agg(id)
 *     FROM tags GROUP BY 1 HAVING count(*) > 1;
 *
 * Relevé le 2026-08-22 sur la base de développement : 0 doublon sur les trois colonnes.
 */
return new class extends Migration
{
    /**
     * La collation racine ICU. Constante plutôt que littéral répété : c'est une
     * DÉCISION (cf. le paragraphe `und-x-icu` ci-dessus), pas un détail de syntaxe.
     */
    private const COLLATION = 'und-x-icu';

    /** @var list<array{0: string, 1: string, 2: string}> table, colonne, nom d'index */
    private const CIBLES = [
        ['tags', 'name', 'tags_name_lower_unique'],
        ['users', 'username', 'users_username_lower_unique'],
        ['users', 'email', 'users_email_lower_unique'],
    ];

    public function up(): void
    {
        foreach (self::CIBLES as [$table, $colonne, $index]) {
            // On garde les MÊMES NOMS d'index. Les recréer sous un nom neuf laisserait
            // `2026_08_21_130000::down()` chercher un index disparu, et ferait diverger
            // le schéma d'une base fraîchement migrée de celui d'une base existante.
            //
            // `DROP` puis `CREATE`, et pas `REINDEX` : ce n'est pas le même index, c'est
            // une autre EXPRESSION.
            DB::statement("DROP INDEX IF EXISTS {$index}");
            DB::statement(
                "CREATE UNIQUE INDEX {$index} ON {$table} (LOWER({$colonne} COLLATE \"".self::COLLATION.'"))'
            );
        }
    }

    public function down(): void
    {
        foreach (self::CIBLES as [$table, $colonne, $index]) {
            // Le retour restaure l'index de `2026_08_21_130000` — l'ASCII-seulement.
            // Il est FAIBLE, et c'est exactement ce qu'un `down()` doit faire : rendre
            // l'état d'avant, pas un état qu'on préfère.
            DB::statement("DROP INDEX IF EXISTS {$index}");
            DB::statement("CREATE UNIQUE INDEX {$index} ON {$table} (LOWER({$colonne}))");
        }
    }
};
