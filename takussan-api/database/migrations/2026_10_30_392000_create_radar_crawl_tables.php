<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2392 (ADR-0077 §10) — la collecte automatique.
 *
 * `radar_crawl_sources` : une ligne par site collecté (`site` = une valeur de `RadarSourceSite`). **Éteinte par défaut** :
 * rien ne part tant que le porteur ne l'allume pas. `operator_id` est l'opérateur qui l'a allumée : l'extraction des
 * annonces qu'elle trouve est jugée en son nom (`captured_by`), la passerelle IA refusant un acteur nul.
 *
 * `radar_crawl_runs` : le journal des passages. Un seul passage `queued` ou `running` par site (index unique partiel) :
 * deux mises en file simultanées n'en créent qu'un. `reached_end` : le passage a lu la dernière page de la liste — sans
 * lui, une annonce non vue n'a pas forcément disparu, elle peut être plus loin que `max_pages`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('radar_crawl_sources', function (Blueprint $table) {
            $table->id();
            $table->string('site', 30);
            $table->boolean('enabled')->default(false);
            $table->unsignedInteger('frequency_minutes')->default(360);
            $table->unsignedSmallInteger('max_pages')->default(5);
            $table->foreignId('operator_id')->nullable()->constrained('users', 'id', 'radar_crawl_sources_operator_fk')->nullOnDelete();
            $table->timestamp('enabled_at')->nullable();
            $table->timestamps();

            $table->unique('site', 'radar_crawl_sources_site_unique');
            $table->index('operator_id', 'radar_crawl_sources_operator_idx');
        });

        Schema::create('radar_crawl_runs', function (Blueprint $table) {
            $table->id();
            $table->string('site', 30);
            $table->string('trigger', 20);
            $table->string('status', 20);
            $table->foreignId('operator_id')->nullable()->constrained('users', 'id', 'radar_crawl_runs_operator_fk')->nullOnDelete();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->unsignedInteger('pages_read')->default(0);
            $table->unsignedInteger('cards_seen')->default(0);
            $table->unsignedInteger('listings_created')->default(0);
            $table->unsignedInteger('listings_known')->default(0);
            $table->unsignedInteger('snapshots_opened')->default(0);
            $table->boolean('reached_end')->default(false);
            $table->string('stop_reason', 60)->nullable();
            $table->timestamps();

            $table->index(['site', 'created_at'], 'radar_crawl_runs_site_created_idx');
            $table->index('operator_id', 'radar_crawl_runs_operator_idx');
        });
        DB::statement("CREATE UNIQUE INDEX radar_crawl_runs_one_active_unique ON radar_crawl_runs (site) WHERE status IN ('queued', 'running')");
    }

    public function down(): void
    {
        Schema::dropIfExists('radar_crawl_runs');
        Schema::dropIfExists('radar_crawl_sources');
    }
};
