<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-278 — Cutover : suppression des tables spatie/laravel-permission.
 *
 * **Aucun pré-requis.** Ce docblock a annoncé pendant tout le cutover que la
 * commande `platform:backfill-from-spatie` devait être exécutée en pre-deploy.
 * Cette commande **n'a jamais existé** — les 14 signatures de
 * `app/Console/Commands/` ne la contiennent pas, et `git log -S` ne trouve la
 * chaîne que dans ce commentaire.
 *
 * Elle n'a pas non plus d'objet : la production n'a jamais été déployée
 * (ardoise D-04 / TCK-288 — `deploy.yml` ne s'est pas exécuté une seule fois),
 * donc il n'existe aucune donnée spatie à reprendre. Le super_admin initial
 * est matérialisé par les seeders (`Core/UserSeeder`, `Support/DemoUsersSeeder`,
 * `TestSeeder`) ou par `php artisan platform:grant-super-admin {email}`.
 *
 * Le laisser en l'état faisait pire que rien : un opérateur qui lit une
 * migration irréversible annonçant une étape pre-deploy introuvable ne peut
 * que s'arrêter, ou l'exécuter en croyant l'avoir sautée. *Un pré-requis
 * inexistant coûte plus cher qu'un pré-requis absent : on le cherche.*
 *
 * Ce qui est vrai : aucun chemin de code applicatif n'écrit ni ne lit plus
 * dans ces tables, et une garde CI (`api-ci.yml`) casse sur tout import du
 * namespace de spatie/laravel-permission.
 *
 * NB — ce docblock ne peut pas citer ce namespace littéralement : la garde
 * grep le cherche dans `database/` aussi, et le citer ferait échouer la CI
 * sur le fichier même qui la documente.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('role_has_permissions');
        Schema::dropIfExists('model_has_permissions');
        Schema::dropIfExists('model_has_roles');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
    }

    public function down(): void
    {
        // Rollback non-supporté : la restauration des rôles/permissions
        // spatie nécessiterait de rejouer le seeder et la backfill, sans
        // garantie de reconstituer l'état historique. Si un rollback est
        // requis, restaurer via dump SQL pré-cutover.
        throw new RuntimeException(
            'TCK-278 cutover migration is irreversible. Restore from a pre-cutover SQL dump if needed.'
        );
    }
};
