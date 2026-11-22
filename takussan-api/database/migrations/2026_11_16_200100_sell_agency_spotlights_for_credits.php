<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2525 (amendement du 2026-11-16 d'ADR-0061) — la place « Mise en avant » de l'annuaire se vend
 * en crédits.
 *
 * - `agency_spotlights` porte son origine (`offered` | `purchased`), son prix figé, son acheteur, et,
 *   une fois libérée (remboursée à la suspension, retirée), `cancelled_at` et `refunded_credits`.
 * - Les deux contraintes d'exclusion d'ADR-0092 ne portent plus que sur les places NON libérées : une
 *   place libérée garde sa ligne (historique, statistiques, référence des mouvements) sans plus
 *   occuper la ville. Un `CHECK (ends_at > starts_at)` interdit d'écourter une place pas encore
 *   commencée : libérer est la seule façon de rendre sa période.
 * - `credit_movements.agency_spotlight_id` : le MOUVEMENT désigne la place, pas l'inverse — une
 *   dépense écrit un mouvement par lot entamé, et le remboursement a besoin du lot d'origine de
 *   chacun. Le trigger d'insertion seule la protège comme `property_boost_id` : mise à NULL admise
 *   seulement depuis l'action référentielle (`pg_trigger_depth() > 1`, TCK-639).
 *
 * `down()` rend la fonction de `2026_10_14_100000` À L'IDENTIQUE, supprime les places libérées (elles
 * chevaucheraient les contraintes rétablies sans filtre) puis rétablit les contraintes d'ADR-0092.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agency_spotlights', function (Blueprint $table) {
            $table->string('origin', 16)->default('offered');
            $table->unsignedInteger('price_credits')->default(0);
            $table->foreignId('purchased_by_id')->nullable()->constrained('users', 'id', 'agency_spotlights_purchased_by_fk')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->unsignedInteger('refunded_credits')->default(0);
            $table->index('purchased_by_id', 'agency_spotlights_purchased_by_idx');
        });
        DB::statement("ALTER TABLE agency_spotlights ADD CONSTRAINT agency_spotlights_origin_check CHECK (origin IN ('offered', 'purchased'))");

        DB::statement('ALTER TABLE agency_spotlights DROP CONSTRAINT agency_spotlights_city_no_overlap');
        DB::statement('ALTER TABLE agency_spotlights DROP CONSTRAINT agency_spotlights_nocity_no_overlap');
        DB::statement('ALTER TABLE agency_spotlights ADD CONSTRAINT agency_spotlights_city_no_overlap EXCLUDE USING gist (geo_city_id WITH =, tsrange(starts_at, ends_at) WITH &&) WHERE (cancelled_at IS NULL)');
        DB::statement('ALTER TABLE agency_spotlights ADD CONSTRAINT agency_spotlights_nocity_no_overlap EXCLUDE USING gist (tsrange(starts_at, ends_at) WITH &&) WHERE (geo_city_id IS NULL AND cancelled_at IS NULL)');

        Schema::table('credit_movements', function (Blueprint $table) {
            $table->foreignId('agency_spotlight_id')->nullable()->constrained('agency_spotlights', 'id', 'credit_movements_spotlight_fk')->nullOnDelete();
            $table->index('agency_spotlight_id', 'credit_movements_spotlight_idx');
        });

        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION credit_movements_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    IF pg_trigger_depth() > 1 THEN
                        RETURN OLD;
                    END IF;
                    RAISE EXCEPTION 'credit_movements est en insertion seule (ADR-0061)' USING ERRCODE = 'P0001';
                END IF;
                IF NEW.id IS DISTINCT FROM OLD.id
                    OR NEW.agency_id IS DISTINCT FROM OLD.agency_id
                    OR NEW.credit_lot_id IS DISTINCT FROM OLD.credit_lot_id
                    OR NEW.type IS DISTINCT FROM OLD.type
                    OR NEW.amount IS DISTINCT FROM OLD.amount
                    OR NEW.reason IS DISTINCT FROM OLD.reason
                    OR NEW.created_at IS DISTINCT FROM OLD.created_at
                    OR (NEW.property_boost_id IS DISTINCT FROM OLD.property_boost_id
                        AND (NEW.property_boost_id IS NOT NULL OR pg_trigger_depth() <= 1))
                    OR (NEW.agency_spotlight_id IS DISTINCT FROM OLD.agency_spotlight_id
                        AND (NEW.agency_spotlight_id IS NOT NULL OR pg_trigger_depth() <= 1))
                    OR (NEW.actor_id IS DISTINCT FROM OLD.actor_id
                        AND (NEW.actor_id IS NOT NULL OR pg_trigger_depth() <= 1)) THEN
                    RAISE EXCEPTION 'credit_movements est en insertion seule (ADR-0061)' USING ERRCODE = 'P0001';
                END IF;
                RETURN NEW;
            END
            $$;
            SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION credit_movements_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    IF pg_trigger_depth() > 1 THEN
                        RETURN OLD;
                    END IF;
                    RAISE EXCEPTION 'credit_movements est en insertion seule (ADR-0061)' USING ERRCODE = 'P0001';
                END IF;
                IF NEW.id IS DISTINCT FROM OLD.id
                    OR NEW.agency_id IS DISTINCT FROM OLD.agency_id
                    OR NEW.credit_lot_id IS DISTINCT FROM OLD.credit_lot_id
                    OR NEW.type IS DISTINCT FROM OLD.type
                    OR NEW.amount IS DISTINCT FROM OLD.amount
                    OR NEW.reason IS DISTINCT FROM OLD.reason
                    OR NEW.created_at IS DISTINCT FROM OLD.created_at
                    OR (NEW.property_boost_id IS DISTINCT FROM OLD.property_boost_id
                        AND (NEW.property_boost_id IS NOT NULL OR pg_trigger_depth() <= 1))
                    OR (NEW.actor_id IS DISTINCT FROM OLD.actor_id
                        AND (NEW.actor_id IS NOT NULL OR pg_trigger_depth() <= 1)) THEN
                    RAISE EXCEPTION 'credit_movements est en insertion seule (ADR-0061)' USING ERRCODE = 'P0001';
                END IF;
                RETURN NEW;
            END
            $$;
            SQL);

        Schema::table('credit_movements', function (Blueprint $table) {
            $table->dropForeign('credit_movements_spotlight_fk');
            $table->dropIndex('credit_movements_spotlight_idx');
            $table->dropColumn('agency_spotlight_id');
        });

        DB::table('agency_spotlights')->whereNotNull('cancelled_at')->delete();
        DB::statement('ALTER TABLE agency_spotlights DROP CONSTRAINT agency_spotlights_city_no_overlap');
        DB::statement('ALTER TABLE agency_spotlights DROP CONSTRAINT agency_spotlights_nocity_no_overlap');
        DB::statement('ALTER TABLE agency_spotlights ADD CONSTRAINT agency_spotlights_city_no_overlap EXCLUDE USING gist (geo_city_id WITH =, tsrange(starts_at, ends_at) WITH &&)');
        DB::statement('ALTER TABLE agency_spotlights ADD CONSTRAINT agency_spotlights_nocity_no_overlap EXCLUDE USING gist (tsrange(starts_at, ends_at) WITH &&) WHERE (geo_city_id IS NULL)');
        DB::statement('ALTER TABLE agency_spotlights DROP CONSTRAINT agency_spotlights_origin_check');

        Schema::table('agency_spotlights', function (Blueprint $table) {
            $table->dropForeign('agency_spotlights_purchased_by_fk');
            $table->dropIndex('agency_spotlights_purchased_by_idx');
            $table->dropColumn(['origin', 'price_credits', 'purchased_by_id', 'cancelled_at', 'refunded_credits']);
        });
    }
};
