<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2652 — le locataire signale sans décrire : `description` devient facultative pour le demandeur
 * (`StoreMaintenanceRequestRequest`), le titre se déduit de la catégorie. La colonne était `NOT NULL`
 * depuis la création de la table : sans cette migration, la création sans description rendait 500.
 *
 * `down()` remet une chaîne vide aux descriptions absentes avant de reposer la contrainte.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE maintenance_requests ALTER COLUMN description DROP NOT NULL');
    }

    public function down(): void
    {
        DB::statement("UPDATE maintenance_requests SET description = '' WHERE description IS NULL");
        DB::statement('ALTER TABLE maintenance_requests ALTER COLUMN description SET NOT NULL');
    }
};
