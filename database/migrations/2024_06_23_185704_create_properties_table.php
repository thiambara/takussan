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
            $table->foreignId('project_id')->nullable()->constrained('projects')->onDelete('cascade');
            $table->foreignId('propriety_id')->nullable()->constrained('properties')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->string('visibility')->default('private');
            $table->string('type')->nullable(); // land, building, apartment, villa, house, office, shop, warehouse, factory, farm, hotel, resort, studio, room, garage, parking, other
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('status');
            $table->float('price')->nullable();
            $table->float('area')->nullable();
            $table->string('position')->nullable(); // adjoining or corner
            $table->integer('level')->nullable(); // for building
            $table->string('title_type')->nullable(); // lease, land title, deliberation
            $table->boolean('with_administrative_monitoring')->nullable();
            $table->string('contract_type'); // sale, rent
            $table->json('servicing')->nullable()->default('[]'); // water, electricity, gas, internet, phone, cable, elevator, parking, garden, pool, security, cleaning, maintenance, surveillance, other
            $table->json('extra')->nullable();
            $table->softDeletes();
            $table->timestamps();
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
