<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-596 §3B (ADR-0041) — une plage `[starts_on, ends_on)` où le bien n'est pas réservable.
 *
 * `ends_on` est EXCLUSIF, comme `bookings.end_date` (jour de départ) : la nuit du `ends_on` reste
 * libre. Une plage importée (`source = ical`) porte son flux et l'`UID` de l'événement ; l'unicité
 * partielle `(calendar_feed_id, external_uid)` rend la synchronisation idempotente.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('property_unavailabilities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained('properties', 'id', 'prop_unavail_property_fk')->cascadeOnDelete();
            $table->date('starts_on');
            $table->date('ends_on');
            $table->string('reason', 255)->nullable();
            $table->string('source', 20)->default('manual');
            $table->foreignId('calendar_feed_id')->nullable()->constrained('property_calendar_feeds', 'id', 'prop_unavail_feed_fk')->cascadeOnDelete();
            $table->string('external_uid', 255)->nullable();
            $table->foreignId('conflict_booking_id')->nullable()->constrained('bookings', 'id', 'prop_unavail_conflict_fk')->nullOnDelete();
            $table->foreignId('created_by_id')->nullable()->constrained('users', 'id', 'prop_unavail_created_by_fk')->nullOnDelete();
            $table->timestamps();

            $table->index(['property_id', 'starts_on', 'ends_on'], 'prop_unavail_property_range_idx');
        });

        DB::statement('CREATE UNIQUE INDEX prop_unavail_feed_uid_unique ON property_unavailabilities (calendar_feed_id, external_uid) WHERE calendar_feed_id IS NOT NULL');
        DB::statement('ALTER TABLE property_unavailabilities ADD CONSTRAINT prop_unavail_range_check CHECK (ends_on > starts_on)');
    }

    public function down(): void
    {
        Schema::dropIfExists('property_unavailabilities');
    }
};
