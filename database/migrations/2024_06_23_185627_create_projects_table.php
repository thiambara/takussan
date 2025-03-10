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
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('status');
            $table->float('area')->nullable();
            $table->string('title_type')->nullable(); // lease, land title, deliberation
            $table->boolean('with_administrative_monitoring')->nullable();
            $table->string('visibility')->default('private');
            $table->json('servicing')->nullable()->default([]);
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->json('extra')->nullable()->default([]);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('projects');
    }
};
