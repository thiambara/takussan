<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-441 — une piste de contact peut désormais viser un AGENT et non un bien.
 *
 * `property_id` devient nullable, et `agency_id` apparaît : l'agence est la frontière
 * d'isolation (principe non négociable n°2), et une piste qui ne porte pas de bien ne peut plus
 * la dériver de lui.
 *
 * ⚠️ `DROP NOT NULL` en SQL brut plutôt que `->change()` : `change()` réécrit la colonne à partir
 * de la définition qu'on lui donne, et emporte ce qu'on a oublié d'y répéter — ici la clé
 * étrangère et son `cascadeOnDelete`. La contrainte n'est pas touchée par un `ALTER COLUMN`.
 *
 * ⚠️ `agency_id` porte un index EXPLICITE : PostgreSQL n'indexe pas une clé étrangère
 * (piège n°8 de CLAUDE.md), et c'est la colonne par laquelle une agence lira ses pistes.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE property_contact_leads ALTER COLUMN property_id DROP NOT NULL');

        Schema::table('property_contact_leads', function (Blueprint $table) {
            $table->foreignId('agency_id')->nullable()->after('property_id')
                ->constrained('agencies')->cascadeOnDelete();
            $table->index(['agency_id', 'created_at'], 'pcl_agency_created_idx');
        });
    }

    /**
     * ⚠️ Ce `down()` est DESTRUCTEUR, et il ne peut pas ne pas l'être : restaurer `NOT NULL`
     * échouerait sur la première piste d'agent enregistrée. Les lignes sans bien sont donc
     * supprimées — c'est le prix d'un retour arrière, et il vaut mieux qu'un `down()` qui échoue
     * le jour où on en a besoin.
     */
    public function down(): void
    {
        DB::table('property_contact_leads')->whereNull('property_id')->delete();

        Schema::table('property_contact_leads', function (Blueprint $table) {
            $table->dropIndex('pcl_agency_created_idx');
            $table->dropConstrainedForeignId('agency_id');
        });

        DB::statement('ALTER TABLE property_contact_leads ALTER COLUMN property_id SET NOT NULL');
    }
};
