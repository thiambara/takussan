<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-592 (B17) — l'unicité (prestataire, agence) ne vaut que pour les lignes VIVANTES.
 *
 * `sp_agency_collab_unique` portait sur une table en `SoftDeletes` sans être partielle : une ligne
 * supprimée en douceur empêchait à jamais de recréer le couple (`23505`). Le défaut était latent —
 * aucun chemin ne supprimait une collaboration — et devenait réel dès qu'une fin de collaboration
 * serait codée en `delete()`. Ce ticket code la fin en `status = ended` (jamais `delete()`), mais
 * l'index se corrige quand même : il ne doit pas dépendre de ce que le code s'abstient de faire.
 *
 * Laravel n'exprime pas un index partiel : SQL brut, PostgreSQL (ADR-0020).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE service_provider_agency_collaborations DROP CONSTRAINT IF EXISTS sp_agency_collab_unique');
        DB::statement('DROP INDEX IF EXISTS sp_agency_collab_unique');
        DB::statement(
            'CREATE UNIQUE INDEX sp_agency_collab_live_unique ON service_provider_agency_collaborations '
            .'(service_provider_profile_id, agency_id) WHERE deleted_at IS NULL'
        );
    }

    /**
     * Restaure l'unicité totale. ⚠ Échoue si deux lignes du même couple coexistent (une vivante, une
     * supprimée) : c'est précisément l'état que `up()` rend possible, et le restaurer en silence
     * supposerait de choisir laquelle effacer.
     */
    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS sp_agency_collab_live_unique');
        DB::statement(
            'ALTER TABLE service_provider_agency_collaborations ADD CONSTRAINT sp_agency_collab_unique '
            .'UNIQUE (service_provider_profile_id, agency_id)'
        );
    }
};
