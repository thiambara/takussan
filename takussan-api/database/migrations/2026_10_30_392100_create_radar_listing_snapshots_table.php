<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2392 — les instantanés datés d'une annonce collectée : ce que la source affichait, et pendant combien de temps.
 * Lus par l'observatoire du marché (TCK-2393).
 *
 * Une ligne = un ÉTAT observé, valable de `first_seen_at` (le passage qui l'a vu le premier) à `last_seen_at` (le
 * dernier qui l'a revu), sur `observations` passages. Un prix ou un titre changé ouvre une ligne nouvelle ; un passage
 * qui revoit le même état prolonge la ligne courante et comble ses colonnes encore vides (valeurs de l'extraction).
 *
 * - `price` : le montant affiché, en XOF (décimal en base, principe n° 3 ; XOF n'a pas de sous-unité). `rent_period`
 *   dit sa période pour une location (`RentPeriod`), null pour une vente ou si la source ne la dit pas.
 * - `contract` (`rent` / `sale`), `property_type` (`PropertyType`), `surface_m2`, `bedrooms` : ce que la carte de la liste
 *   montre, sinon la valeur relue de l'extraction (`RadarReviewFields::values()`).
 * - `neighborhood_label` : le lieu tel qu'écrit par la source (« Almadies, Dakar ») ; `geo_neighborhood_id` : le quartier
 *   du référentiel quand l'extraction l'a rattaché ; `city` : la ville lue.
 * - `title_fingerprint` : SHA-256 du titre replié — le texte se compare, il n'est pas gardé (ADR-0077 §9).
 *
 * Présence d'une annonce : de `min(first_seen_at)` à `max(last_seen_at)` sur ses lignes. ⚠ Une annonce absente d'un passage
 * n'a disparu que si ce passage a lu toute la liste (`radar_crawl_runs.reached_end`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('radar_listing_snapshots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('radar_listing_id')->constrained('radar_listings', 'id', 'radar_snapshots_listing_fk')->cascadeOnDelete();
            $table->foreignId('crawl_run_id')->nullable()->constrained('radar_crawl_runs', 'id', 'radar_snapshots_run_fk')->nullOnDelete();
            $table->decimal('price', 15, 2)->nullable();
            $table->string('rent_period', 20)->nullable();
            $table->string('contract', 10)->nullable();
            $table->string('property_type', 40)->nullable();
            $table->decimal('surface_m2', 10, 2)->nullable();
            $table->unsignedSmallInteger('bedrooms')->nullable();
            $table->string('neighborhood_label', 160)->nullable();
            $table->foreignId('geo_neighborhood_id')->nullable()->constrained('geo_neighborhoods', 'id', 'radar_snapshots_neighborhood_fk')->nullOnDelete();
            $table->string('city', 120)->nullable();
            $table->string('title_fingerprint', 64)->nullable();
            $table->timestamp('first_seen_at');
            $table->timestamp('last_seen_at');
            $table->unsignedInteger('observations')->default(1);
            $table->timestamps();

            $table->index(['radar_listing_id', 'first_seen_at'], 'radar_snapshots_listing_seen_idx');
            $table->index('crawl_run_id', 'radar_snapshots_run_idx');
            $table->index('geo_neighborhood_id', 'radar_snapshots_neighborhood_idx');
            $table->index('last_seen_at', 'radar_snapshots_last_seen_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('radar_listing_snapshots');
    }
};
