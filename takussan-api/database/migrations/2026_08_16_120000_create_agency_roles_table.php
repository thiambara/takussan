<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-279 — rôles par agence (models-spec.md §52).
 *
 * Pensée pour MySQL 8.0 :
 *  - pas d'`enum()` : `base_profile_type` est un `string` contrôlé par
 *    l'enum applicative `AgencyRoleBaseType` ;
 *  - pas de `DEFAULT` sur type restreint (aucune colonne JSON/TEXT ici) ;
 *  - noms d'index explicites pour rester sous les 64 caractères MySQL.
 *
 * La contrainte « exactement un rôle système par (agency_id,
 * base_profile_type) » de la spec est un unique **partiel**
 * (`WHERE is_system = true`), que MySQL 8.0 ne sait pas exprimer. Elle est
 * tenue applicativement par `AgencySystemRoleSeeder` (firstOrCreate) et par
 * `AgencyRolePolicy` (aucun rôle système ne se crée par l'API). L'unique
 * `(agency_id, name)` ci-dessous en couvre déjà l'effet visible : deux rôles
 * système du même type porteraient le même nom par défaut.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agency_roles', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->string('name');
            $table->string('base_profile_type');
            $table->text('description')->nullable();
            $table->boolean('is_system')->default(false);
            $table->boolean('is_clonable')->default(true);
            $table->timestamps();

            $table->unique(['agency_id', 'name'], 'agency_roles_agency_name_unique');
            $table->index(['agency_id', 'base_profile_type'], 'agency_roles_agency_base_type_idx');
            $table->index(['agency_id', 'is_system'], 'agency_roles_agency_is_system_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agency_roles');
    }
};
