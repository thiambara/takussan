<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-315 (ADR-0015) — le rôle d'agence d'un prestataire vit sur la
 * COLLABORATION, pas sur le profil.
 *
 * TCK-279 avait posé `agency_role_id` sur trois tables de profils et laissé
 * `service_provider_profiles` de côté — non par oubli, mais parce que cette
 * table n'a **aucune** colonne `agency_id` et un `user_id` UNIQUE : un
 * prestataire a un profil global et sert N agences. Un pointeur unique y
 * aurait désigné le rôle d'UNE agence pour un profil qui en sert N, en
 * contredisant silencieusement « l'agence est la frontière d'isolation ».
 *
 * `service_provider_agency_collaborations` porte déjà exactement le couple
 * (profil, agence) — contrainte unique `sp_agency_collab_unique`. C'est là
 * que le pointeur est juste, et c'est ce qu'ADR-0015 acte.
 *
 * Trois étapes séparées, comme pour TCK-279 : nullable ici, backfillé par
 * la migration suivante, NOT NULL par celle d'après. Chacune est vérifiable
 * seule — un backfill qui laisserait une collaboration orpheline casserait
 * l'autorisation de ce prestataire en silence.
 *
 * FK nommée explicitement : `service_provider_agency_collaborations` fait
 * déjà 38 caractères, et le nom auto-généré frôle la limite MySQL de 64.
 *
 * `restrictOnDelete` : supprimer un rôle encore porté par une collaboration
 * est refusé au niveau base, pas seulement au niveau API — même règle que
 * pour les trois profils.
 */
return new class extends Migration
{
    private const TABLE = 'service_provider_agency_collaborations';

    private const FK = 'sp_agency_collab_agency_role_fk';

    public function up(): void
    {
        Schema::table(self::TABLE, function (Blueprint $table): void {
            $table->foreignId('agency_role_id')
                ->nullable()
                ->constrained('agency_roles', 'id', self::FK)
                ->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table(self::TABLE, function (Blueprint $table): void {
            // La FK back l'index de la colonne : MySQL refuse de dropper la
            // colonne tant que la contrainte existe. On la lâche d'abord.
            $table->dropForeign(self::FK);
            $table->dropColumn('agency_role_id');
        });
    }
};
