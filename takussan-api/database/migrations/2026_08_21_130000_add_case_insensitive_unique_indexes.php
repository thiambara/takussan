<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Rend leur SENS à trois contraintes d'unicité que le passage à PostgreSQL avait
 * silencieusement affaiblies (ADR-0020 §4.2).
 *
 * ─── Le danger, et pourquoi il ne rougissait nulle part ────────────────────────────
 *
 * L'ancienne production tournait en `utf8mb4_0900_ai_ci` : comparaisons INSENSIBLES à
 * la casse et aux accents. `Dakar` et `dakar` violaient donc l'unicité de `tags.name`.
 * PostgreSQL en `--locale=C` compare octet à octet : ce sont deux lignes.
 *
 * **Une contrainte qui change de sens ne lève aucune erreur — elle laisse passer un
 * doublon.** Aucun test du dépôt n'est devenu rouge, et aucun ne pouvait le devenir :
 * pas un seul n'insérait de variante de casse. Le défaut se serait manifesté dans les
 * DONNÉES, des mois plus tard.
 *
 * ─── Les six contraintes, et pourquoi trois seulement sont ici ─────────────────────
 *
 * Six contraintes d'unicité portent sur du texte. Trois sont sûres PAR CONSTRUCTION et
 * n'ont rien à faire dans cette migration :
 *
 *   · `properties.slug`, `agencies.slug`, `tags.slug` — tous fabriqués par `Str::slug()`,
 *     qui met en minuscules ET translittère les accents. Une variante de casse ne peut
 *     pas naître ; ajouter un index sur `LOWER()` n'attraperait rien de plus et
 *     coûterait à l'écriture.
 *
 * Les trois autres sont traitées ici :
 *
 *   · `tags.name` — aucune normalisation. Et l'application SUPPOSE DÉJÀ l'insensibilité
 *     à la casse : `CustomerTagController.php:42` cherche par `LOWER(name) = ?`. Sans
 *     cet index, cette recherche peut trouver deux lignes là où le domaine en veut une.
 *   · `users.username` — aucune normalisation.
 *   · `users.email` — `User::setEmailAttribute()` met déjà en minuscules à l'écriture.
 *     L'index est donc une DÉFENSE EN PROFONDEUR, pas une redondance : un
 *     `DB::table('users')->insert(…)`, un seeder, une commande de reprise ou un
 *     `updateQuietly` court-circuitent le mutateur. *La normalisation applicative garde
 *     le comportement ; l'index garde les données.*
 *
 * ─── ⚠ Ce que cette migration NE restaure PAS, délibérément ────────────────────────
 *
 * **L'insensibilité aux ACCENTS.** `Café` et `Cafe` étaient le même tag sous
 * `ai_ci` ; ils sont désormais deux. La restaurer exigerait l'extension `unaccent`,
 * qu'ADR-0020 §2 refuse d'installer sans un ticket qui la porte — *une extension créée
 * « au cas où » est une dépendance que personne n'a décidée.*
 *
 * Et ce n'est pas seulement de la prudence de chantier : `José` et `Jose` sont deux
 * adresses e-mail DIFFÉRENTES, et deux noms de personne différents. L'insensibilité aux
 * accents de MySQL était un défaut de collation subi, jamais une règle métier écrite.
 * La perdre est plus près d'une correction que d'une régression — mais c'est un
 * changement de comportement, alors il est écrit ici plutôt que découvert.
 *
 * ─── La casse STOCKÉE est préservée ────────────────────────────────────────────────
 *
 * On indexe `LOWER(col)` plutôt que de forcer la colonne en minuscules : `Dakar` reste
 * affiché `Dakar`. Seule la COMPARAISON devient insensible à la casse, ce qui est
 * exactement ce que faisait `ai_ci`.
 */
return new class extends Migration
{
    /** @var list<array{0: string, 1: string, 2: string}> table, colonne, nom d'index */
    private const CIBLES = [
        ['tags', 'name', 'tags_name_lower_unique'],
        ['users', 'username', 'users_username_lower_unique'],
        ['users', 'email', 'users_email_lower_unique'],
    ];

    public function up(): void
    {
        foreach (self::CIBLES as [$table, $colonne, $index]) {
            // `LOWER(col)` et non `col` : c'est une contrainte sur une EXPRESSION, que
            // le constructeur de schéma de Laravel ne sait pas exprimer.
            //
            // ⚠ Aucun `WHERE … IS NOT NULL` : en PostgreSQL, deux NULL ne sont jamais
            // égaux, donc un index unique laisse déjà passer autant de NULL qu'on veut.
            // `users.username` est nullable — c'est voulu, et cet index ne le change pas.
            DB::statement("CREATE UNIQUE INDEX {$index} ON {$table} (LOWER({$colonne}))");
        }
    }

    public function down(): void
    {
        foreach (self::CIBLES as [, , $index]) {
            DB::statement("DROP INDEX IF EXISTS {$index}");
        }
    }
};
