<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 lot F (ADR-0061 §4, §5, §10) — le catalogue, les boosts achetés ou offerts, et leurs
 * compteurs quotidiens. Genres et statuts en `string` (ADR-0007 : jamais `enum()`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('boost_products', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 20);
            $table->string('variant', 20)->nullable();
            $table->unsignedSmallInteger('duration_days')->default(0);
            $table->unsignedInteger('price_credits');
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            // Une offre = (genre, variante, durée). `nulls not distinct` : sans lui, deux Remontées
            // à variante nulle passeraient l'unicité (PostgreSQL tient deux NULL pour distincts).
            $table->unique(['kind', 'variant', 'duration_days'], 'boost_products_offer_unique')->nullsNotDistinct();
        });
        DB::statement('ALTER TABLE boost_products ADD CONSTRAINT boost_products_price_check CHECK (price_credits >= 0)');

        Schema::create('property_boosts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained('properties', 'id', 'property_boosts_property_fk')->cascadeOnDelete();
            $table->foreignId('agency_id')->constrained('agencies', 'id', 'property_boosts_agency_fk')->cascadeOnDelete();
            $table->foreignId('boost_product_id')->nullable()->constrained('boost_products', 'id', 'property_boosts_product_fk')->nullOnDelete();
            $table->string('kind', 20);
            $table->string('variant', 20)->nullable();
            // Prix et durée FIGÉS à l'achat (ADR-0061 §4) ; une prolongation de Vedette les cumule.
            $table->unsignedInteger('price_credits');
            $table->unsignedSmallInteger('duration_days');
            $table->timestamp('starts_at');
            $table->timestamp('ends_at')->nullable();
            $table->string('status', 20);
            $table->unsignedInteger('remaining_seconds')->nullable();
            $table->timestamp('paused_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->boolean('offered')->default(false);
            $table->text('offer_reason')->nullable();
            $table->foreignId('purchased_by_id')->nullable()->constrained('users', 'id', 'property_boosts_purchased_by_fk')->nullOnDelete();
            $table->text('cancel_reason')->nullable();
            $table->foreignId('cancelled_by_id')->nullable()->constrained('users', 'id', 'property_boosts_cancelled_by_fk')->nullOnDelete();
            $table->unsignedInteger('refunded_credits')->nullable();
            $table->timestamps();
            $table->index(['property_id', 'kind', 'status'], 'property_boosts_property_kind_status_idx');
            $table->index(['status', 'ends_at'], 'property_boosts_status_ends_at_idx');
            $table->index('agency_id', 'property_boosts_agency_idx');
        });

        Schema::create('property_boost_daily_stats', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_boost_id')->constrained('property_boosts', 'id', 'property_boost_daily_stats_boost_fk')->cascadeOnDelete();
            $table->date('date');
            $table->unsignedInteger('impressions')->default(0);
            $table->unsignedInteger('clicks')->default(0);
            $table->timestamps();
            $table->unique(['property_boost_id', 'date'], 'property_boost_daily_stats_boost_date_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('property_boost_daily_stats');
        Schema::dropIfExists('property_boosts');
        Schema::dropIfExists('boost_products');
    }
};
