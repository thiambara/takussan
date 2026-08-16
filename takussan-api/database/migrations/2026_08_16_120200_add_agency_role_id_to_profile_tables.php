<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-279 — pointeur `agency_role_id` sur les profils métier
 * (models-spec.md Règle 6).
 *
 * **Trois tables, pas quatre.** La Règle 6 et le delta du ticket citent
 * aussi `service_provider_profiles`. Cette table n'a **aucune** colonne
 * `agency_id` et son `user_id` est UNIQUE : un `ServiceProviderProfile`
 * est user-scopé et collabore avec N agences via
 * `service_provider_agency_collaborations`. Un `agency_role_id` unique y
 * désignerait le rôle d'UNE agence pour un profil qui en sert plusieurs —
 * ce qui contredit « l'agence est la frontière d'isolation ». La décision
 * (rôle porté par la collaboration, ou profil rendu agence-scopé) demande
 * un ADR et n'est pas tranchée par la spec : voir les notes de TCK-279.
 *
 * Ajouté **nullable ici**, backfillé par la migration suivante, passé
 * NOT NULL par celle d'après. Trois étapes séparées, chacune vérifiable :
 * un backfill qui laisserait un profil orphelin casserait l'autorisation
 * de cet utilisateur en silence.
 *
 * `restrictOnDelete` : supprimer un rôle encore utilisé est refusé au
 * niveau base, pas seulement au niveau API (spec §52).
 */
return new class extends Migration
{
    /** @var array<string,string> table => nom court de la FK */
    private const TABLES = [
        'agent_profiles' => 'agent_profiles_agency_role_id_fk',
        'agency_admin_profiles' => 'agency_admin_profiles_agency_role_fk',
        'owner_profiles' => 'owner_profiles_agency_role_id_fk',
    ];

    public function up(): void
    {
        foreach (self::TABLES as $table => $fkName) {
            Schema::table($table, function (Blueprint $blueprint) use ($fkName): void {
                $blueprint->foreignId('agency_role_id')
                    ->nullable()
                    ->constrained('agency_roles', 'id', $fkName)
                    ->restrictOnDelete();
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table => $fkName) {
            Schema::table($table, function (Blueprint $blueprint) use ($fkName): void {
                // La FK back l'index de la colonne : MySQL refuse de dropper
                // la colonne tant que la contrainte existe. On la lâche d'abord.
                $blueprint->dropForeign($fkName);
                $blueprint->dropColumn('agency_role_id');
            });
        }
    }
};
