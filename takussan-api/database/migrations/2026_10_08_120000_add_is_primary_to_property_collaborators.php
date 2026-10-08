<?php

use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-504 (ADR-0053 §1, §6) — l'agent principal d'un bien est une MARQUE sur sa ligne de
 * collaboration : au plus une par bien, réservée au rôle `agent`, et les deux tenues par le schéma.
 *
 * Laravel n'exprime ni un index partiel ni un `CHECK` : SQL brut, PostgreSQL (ADR-0020).
 *
 * Le backfill pose la marque sur la ligne que `PrimaryPropertyContact::collaborateurPrincipal()`
 * rend MAINTENANT — sans aucune marque, c'est la règle de TCK-502/590 —, pour qu'aucune fiche ne
 * change de contact à la migration. Il appelle la définition unique plutôt que d'en recopier une :
 * une copie divergerait au premier changement de l'éligibilité. Il écrit par le constructeur de
 * requêtes : ni évènement de modèle, ni invalidation du cache public en masse.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('property_collaborators', function (Blueprint $table) {
            $table->boolean('is_primary')->default(false)->after('role');
        });

        DB::statement(
            'CREATE UNIQUE INDEX property_collaborators_one_primary_per_property '
            .'ON property_collaborators (property_id) WHERE is_primary'
        );
        DB::statement(
            'ALTER TABLE property_collaborators ADD CONSTRAINT property_collaborators_primary_is_agent '
            ."CHECK (NOT is_primary OR role = '".CollaboratorRole::Agent->value."')"
        );

        $this->backfill();
    }

    /**
     * Les choix posés depuis `up()` sont perdus et le repli de TCK-502 reprend : c'est le
     * comportement d'avant, pas un état incohérent.
     */
    public function down(): void
    {
        DB::statement('ALTER TABLE property_collaborators DROP CONSTRAINT IF EXISTS property_collaborators_primary_is_agent');
        DB::statement('DROP INDEX IF EXISTS property_collaborators_one_primary_per_property');

        Schema::table('property_collaborators', function (Blueprint $table) {
            $table->dropColumn('is_primary');
        });
    }

    private function backfill(): void
    {
        Property::withTrashed()
            ->whereHas('collaborators', fn ($q) => $q->where('role', CollaboratorRole::Agent->value))
            ->with(PrimaryPropertyContact::eagerLoads())
            ->chunkById(200, function ($properties): void {
                $ids = [];
                foreach ($properties as $property) {
                    $principal = PrimaryPropertyContact::collaborateurPrincipal($property);
                    if ($principal !== null) {
                        $ids[] = $principal->id;
                    }
                }

                if ($ids !== []) {
                    DB::table('property_collaborators')->whereIn('id', $ids)->update(['is_primary' => true]);
                }
            });
    }
};
