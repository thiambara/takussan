<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-279 — pivot rôle ↔ capacité (models-spec.md §53).
 *
 * `capability` n'est **pas** une FK : le catalogue `Capability` est
 * code-defined (ADR-0003). Une validation applicative
 * (`Rule::enum(Capability::class)`) refuse toute valeur hors enum à
 * l'écriture, et le modèle `AgencyRoleCapability` filtre à la lecture.
 *
 * Noms d'index explicites — l'auto-généré
 * `agency_role_capabilities_agency_role_id_capability_unique` fait 57
 * caractères : sous la limite MySQL de 64, mais on ne laisse pas la marge
 * dépendre de la longueur d'un nom de colonne.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agency_role_capabilities', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('agency_role_id')
                ->constrained('agency_roles', 'id', 'arc_agency_role_id_fk')
                ->cascadeOnDelete();
            $table->string('capability');
            $table->timestamps();

            $table->unique(['agency_role_id', 'capability'], 'arc_role_capability_unique');
            $table->index('capability', 'arc_capability_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agency_role_capabilities');
    }
};
