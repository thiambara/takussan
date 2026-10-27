<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2386 (ADR-0077 §1, §9) — une annonce collectée. Elle vit ici, jamais dans `properties`,
 * tant que son annonceur n'a pas donné un accord prouvé ; `property_id` pointe vers le bien publié.
 * `purge_at` = collecte + 90 jours : le texte brut, les captures et le téléphone d'une annonce
 * jamais publiée s'effacent à cette date.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('radar_listings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('radar_advertiser_id')->nullable()->constrained('radar_advertisers')->nullOnDelete();
            $table->string('source_kind', 20);
            $table->string('source_site', 30);
            $table->text('source_url')->nullable();
            $table->text('raw_text')->nullable();
            $table->jsonb('photo_urls')->default('[]');
            $table->string('content_fingerprint', 64);
            $table->jsonb('extracted')->nullable();
            $table->jsonb('matches')->default('[]');
            $table->string('stage', 30);
            $table->string('stage_reason', 60)->nullable();
            $table->smallInteger('extraction_attempts')->default(0);
            $table->timestamp('extracted_at')->nullable();
            $table->foreignId('property_id')->nullable()->constrained('properties')->nullOnDelete();
            $table->foreignId('captured_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('purge_at')->nullable();
            $table->timestamps();

            $table->unique('content_fingerprint', 'radar_listings_fingerprint_unique');
            $table->index('radar_advertiser_id', 'radar_listings_advertiser_idx');
            $table->index('stage', 'radar_listings_stage_idx');
            $table->index('property_id', 'radar_listings_property_idx');
            $table->index('captured_by', 'radar_listings_captured_by_idx');
            $table->index('purge_at', 'radar_listings_purge_at_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('radar_listings');
    }
};
