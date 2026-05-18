<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-278 — Cutover : suppression des tables spatie/laravel-permission.
 *
 * Pré-requis : la commande `platform:backfill-from-spatie` a été exécutée
 * en pre-deploy et tous les super_admins ont un PlatformProfile actif.
 * Aucun chemin de code applicatif n'écrit ni ne lit plus dans ces tables.
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
