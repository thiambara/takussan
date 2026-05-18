<?php

use App\Models\Enums\ServiceProviderProfileStatus;
use App\Services\Invitation\ServiceProviderInvitationService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-260 — un ServiceProviderProfile peut être créé en `draft` au moment
 * de l'envoi d'une invitation, avant que l'utilisateur cible n'existe
 * (compte créé à l'acceptation par {@see ServiceProviderInvitationService}).
 *
 * Conséquences :
 *  - `user_id` doit pouvoir être `NULL` pendant la durée du draft, puis
 *    redevient renseigné à l'acceptation. On retire en plus la contrainte
 *    `unique(user_id)` héritée de la migration initiale (pour permettre
 *    plusieurs drafts coexistants — l'unicité réelle est portée par
 *    `service_provider_agency_collaborations.unique(profile, agency)`).
 *  - On introduit une colonne `status` (mirror OwnerProfile/AgentProfile)
 *    pour matérialiser le cycle de vie du profil indépendamment des
 *    rattachements multi-agences (TCK-262).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_provider_profiles', function (Blueprint $table): void {
            // SQLite (CI) requires dropping the unique constraint before
            // changing the column to nullable. The index name follows
            // Laravel's default convention.
            $table->dropUnique('service_provider_profiles_user_id_unique');
        });

        Schema::table('service_provider_profiles', function (Blueprint $table): void {
            $table->foreignId('user_id')->nullable()->change();

            if (! Schema::hasColumn('service_provider_profiles', 'status')) {
                $table->string('status')
                    ->default(ServiceProviderProfileStatus::Active->value)
                    ->after('user_id');
                $table->index('status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('service_provider_profiles', function (Blueprint $table): void {
            if (Schema::hasColumn('service_provider_profiles', 'status')) {
                $table->dropIndex(['status']);
                $table->dropColumn('status');
            }
        });

        Schema::table('service_provider_profiles', function (Blueprint $table): void {
            $table->foreignId('user_id')->nullable(false)->change();
            $table->unique('user_id', 'service_provider_profiles_user_id_unique');
        });
    }
};
