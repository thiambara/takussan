<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('properties', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('properties')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('agency_id')->nullable()->constrained('agencies')->onDelete('set null');

            // Informations générales
            $table->string('title')->index();
            $table->text('description')->nullable();
            $table->string('type')->index(); // land, building, apartment, villa, house, office, shop, warehouse, factory, farm, hotel, resort, studio, room, garage, parking, other
            $table->string('status')->default('active')->index();
            $table->string('visibility')->default('private');

            // Attributs spécifiques aux propriétés physiques
            $table->float('price', 14)->nullable();
            $table->float('area', 14)->nullable();
            $table->string('position')->nullable(); // adjoining or corner
            $table->integer('level')->nullable(); // for building
            $table->string('title_type')->nullable(); // lease, land title, deliberation
            $table->boolean('with_administrative_monitoring')->default(false)->nullable();
            $table->string('contract_type'); // sale, rent

            // Informations techniques et services
            $table->json('servicing')->nullable()->default('[]'); // water, electricity, gas, internet, phone, cable, elevator, parking, garden, pool, security, cleaning, maintenance, surveillance, other
            $table->json('metadata')->nullable()->default('[]'); // Pour stocker des attributs supplémentaires spécifiques au type

            // Champs de suivi
            $table->timestamps();
            $table->softDeletes();


            // Index pour la recherche "Appartements à vendre actifs"
            $table->index(['status', 'contract_type', 'type'], 'properties_search_idx');

            // Index pour le tri par prix sur des listes filtrées
            $table->index(['status', 'contract_type', 'price'], 'properties_price_idx');

            // Index pour le tri par date (Nouveautés)
            $table->index(['status', 'created_at'], 'properties_recency_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('properties');
    }
};
