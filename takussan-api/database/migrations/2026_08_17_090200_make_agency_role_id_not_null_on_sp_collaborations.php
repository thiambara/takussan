<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-315 (ADR-0016) — troisième et dernière étape : `agency_role_id`
 * devient NOT NULL sur `service_provider_agency_collaborations`.
 *
 * C'est ce qui donne son sens à la Règle 6 telle qu'ADR-0016 la réécrit :
 * « 1 profil = 1 rôle, sauf `ServiceProviderProfile` où c'est 1
 * COLLABORATION = 1 rôle ». Pas de fallback nullable — une collaboration
 * sans rôle serait un prestataire dont les droits dépendent d'un chemin
 * implicite, c'est-à-dire exactement ce que ce ticket supprime.
 *
 * La FK posée en 090000 n'est pas touchée : MySQL accepte `MODIFY COLUMN`
 * sur une colonne portant une FK tant que le type ne change pas. On ne
 * droppe donc ni la contrainte ni son index — le piège documenté ne
 * concerne que `dropUnique`/`dropIndex`/`dropColumn`.
 */
return new class extends Migration
{
    private const TABLE = 'service_provider_agency_collaborations';

    public function up(): void
    {
        $orphans = DB::table(self::TABLE)->whereNull('agency_role_id')->count();
        if ($orphans > 0) {
            throw new RuntimeException(
                'TCK-315: `'.self::TABLE."` porte encore {$orphans} ligne(s) sans `agency_role_id` — ".
                'le backfill 090100 n\'a pas abouti. NOT NULL refusé.'
            );
        }

        Schema::table(self::TABLE, function (Blueprint $table): void {
            $table->unsignedBigInteger('agency_role_id')->nullable(false)->change();
        });
    }

    public function down(): void
    {
        Schema::table(self::TABLE, function (Blueprint $table): void {
            $table->unsignedBigInteger('agency_role_id')->nullable()->change();
        });
    }
};
