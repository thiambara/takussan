<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-279 — rôles par agence (models-spec.md §52).
 *
 * Écrite pour MySQL 8.0 le 2026-08-16, relue pour PostgreSQL 17 le 2026-08-22
 * (ADR-0020). Ce que le DDL ci-dessous garde, et pourquoi :
 *  - pas d'`enum()` : `base_profile_type` est un `string` contrôlé par
 *    l'enum applicative `AgencyRoleBaseType`. La règle survit au changement de
 *    moteur, mais pour sa raison propre (ADR-0007) : un `string` plus un contrôle
 *    applicatif se fait évoluer, un type SQL énuméré non ;
 *  - noms d'index explicites. La limite était 64 sous MySQL, elle est **63** sous
 *    PostgreSQL — et PostgreSQL ne refuse pas, il TRONQUE avec un simple `NOTICE`.
 *    Les trois noms ci-dessous font 31, 33 et 33 caractères (mesurés).
 *
 * ⚠ La contrainte « exactement un rôle système par (agency_id, base_profile_type) »
 * de la spec est un unique **PARTIEL** (`WHERE is_system`). Ce docblock la justifiait
 * par « MySQL 8.0 ne sait pas l'exprimer » : c'est PÉRIMÉ — PostgreSQL le sait, et
 * le dépôt en pose déjà ailleurs (`agency_upgrade_requests_one_pending_per_agency`).
 * Elle reste tenue applicativement par `AgencySystemRoleSeeder` (firstOrCreate) et
 * par `AgencyRolePolicy` (aucun rôle système ne se crée par l'API), et l'unique
 * `(agency_id, name)` ci-dessous en couvre l'effet visible : deux rôles système du
 * même type porteraient le même nom par défaut. **Cette migration n'est PAS modifiée** —
 * elle est jouée, la corriger sur place ne changerait aucune base existante. L'index est
 * posé par une migration NEUVE, le 2026-08-22 :
 * `2026_08_22_100100_add_partial_unique_index_on_agency_system_roles`.
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
