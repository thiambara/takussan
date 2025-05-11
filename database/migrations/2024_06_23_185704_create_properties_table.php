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

            // Informations générales
            $table->string('title')->fulltext();
            $table->text('description')->nullable()->fulltext();
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
