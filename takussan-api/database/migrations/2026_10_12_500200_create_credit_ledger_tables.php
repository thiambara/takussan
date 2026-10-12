<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 lot F (ADR-0061 §1, §2, §3) — le registre de crédits d'un espace.
 *
 * `credit_movements` est en INSERTION SEULE, tenue par un trigger et non par une convention : un
 * UPDATE ou un DELETE direct lève. Deux exceptions, toutes deux structurelles :
 *   · la suppression EN CASCADE d'un parent (`pg_trigger_depth() > 1` : elle vient d'un trigger
 *     d'intégrité référentielle) — sinon une agence ou un lot supprimés pour de bon bloqueraient ;
 *   · la mise à NULL de `property_boost_id` / `actor_id` par `ON DELETE SET NULL` — le montant, le
 *     type, le lot et la date restent intouchables.
 * `TRUNCATE` ne déclenche pas les triggers de ligne : seul le harnais de test l'emploie.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('credit_lots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies', 'id', 'credit_lots_agency_fk')->cascadeOnDelete();
            $table->string('origin', 20);
            $table->unsignedInteger('initial_amount');
            $table->unsignedInteger('remaining_amount');
            $table->timestamp('expires_at')->nullable();
            $table->foreignId('granted_by_id')->nullable()->constrained('users', 'id', 'credit_lots_granted_by_fk')->nullOnDelete();
            $table->text('reason')->nullable();
            $table->timestamp('expiry_notice_sent_at')->nullable();
            $table->timestamps();
            $table->index(['agency_id', 'expires_at'], 'credit_lots_agency_expires_idx');
        });
        DB::statement('ALTER TABLE credit_lots ADD CONSTRAINT credit_lots_amounts_check CHECK (initial_amount > 0 AND remaining_amount >= 0 AND remaining_amount <= initial_amount)');

        Schema::create('credit_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies', 'id', 'credit_movements_agency_fk')->cascadeOnDelete();
            $table->foreignId('credit_lot_id')->constrained('credit_lots', 'id', 'credit_movements_lot_fk')->cascadeOnDelete();
            $table->string('type', 20);
            $table->integer('amount');
            $table->foreignId('property_boost_id')->nullable()->constrained('property_boosts', 'id', 'credit_movements_boost_fk')->nullOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users', 'id', 'credit_movements_actor_fk')->nullOnDelete();
            $table->text('reason')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['agency_id', 'id'], 'credit_movements_agency_id_idx');
            $table->index('credit_lot_id', 'credit_movements_lot_idx');
            $table->index('property_boost_id', 'credit_movements_boost_idx');
        });
        DB::statement('ALTER TABLE credit_movements ADD CONSTRAINT credit_movements_amount_check CHECK (amount <> 0)');

        DB::unprepared(<<<'SQL'
            CREATE FUNCTION credit_movements_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
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
            CREATE TRIGGER credit_movements_append_only_trg
                BEFORE UPDATE OR DELETE ON credit_movements
                FOR EACH ROW EXECUTE FUNCTION credit_movements_append_only();
            SQL);

        Schema::create('credit_welcome_grants', function (Blueprint $table) {
            $table->id();
            // Empreinte HMAC du numéro (`App\Support\PhoneFingerprint`) : survit à l'anonymisation
            // du compte, qui efface `users.phone` (ADR-0061 §3).
            $table->string('phone_hash', 64)->unique('credit_welcome_grants_phone_hash_unique');
            $table->foreignId('agency_id')->nullable()->constrained('agencies', 'id', 'credit_welcome_grants_agency_fk')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users', 'id', 'credit_welcome_grants_user_fk')->nullOnDelete();
            $table->foreignId('credit_lot_id')->nullable()->constrained('credit_lots', 'id', 'credit_welcome_grants_lot_fk')->nullOnDelete();
            $table->timestamp('granted_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_welcome_grants');
        DB::unprepared('DROP TRIGGER IF EXISTS credit_movements_append_only_trg ON credit_movements');
        Schema::dropIfExists('credit_movements');
        DB::unprepared('DROP FUNCTION IF EXISTS credit_movements_append_only()');
        Schema::dropIfExists('credit_lots');
    }
};
