<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-639 (ADR-0061 §2) — passe 012 de `/sync-specs` : le trigger du registre tenait moins que ce
 * que `models-spec.md` §96 promettait.
 *
 * La fonction de `2026_10_12_500200` admettait la mise à NULL de `property_boost_id` / `actor_id`
 * SANS condition de profondeur. Elle visait l'action `ON DELETE SET NULL` d'une clé étrangère, mais
 * un `UPDATE credit_movements SET actor_id = NULL` émis directement passait aussi — et effaçait
 * l'auteur d'un octroi ou d'un retrait de super-admin, dans une table qui se dit en insertion seule.
 *
 * La mise à NULL suit désormais la règle de la suppression en cascade : admise à
 * `pg_trigger_depth() > 1` seulement. L'action référentielle s'exécute DEPUIS le trigger
 * d'intégrité de la table parente (profondeur 1), et l'UPDATE qu'elle émet déclenche celui-ci à la
 * profondeur 2 ; un UPDATE direct le déclenche à la profondeur 1, et lève.
 *
 * Limite assumée : la profondeur dit « émis par un trigger », pas « émis par une clé étrangère ».
 * Aucun autre trigger du dépôt n'écrit `credit_movements` ; en ajouter un rouvrirait la mise à NULL
 * de ces deux colonnes, et rien d'autre.
 *
 * `down()` rend la fonction de `500200` À L'IDENTIQUE (même texte, même indentation : `prosrc` est
 * comparé octet pour octet dans les notes de TCK-639). Le trigger, lui, n'est pas recréé : il
 * appelle la fonction par son nom, `CREATE OR REPLACE` suffit dans les deux sens.
 */
return new class extends Migration
{
    public function up(): void
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
                    OR (NEW.property_boost_id IS DISTINCT FROM OLD.property_boost_id AND NEW.property_boost_id IS NOT NULL)
                    OR (NEW.actor_id IS DISTINCT FROM OLD.actor_id AND NEW.actor_id IS NOT NULL) THEN
                    RAISE EXCEPTION 'credit_movements est en insertion seule (ADR-0061)' USING ERRCODE = 'P0001';
                END IF;
                RETURN NEW;
            END
            $$;
            SQL);
    }
};
