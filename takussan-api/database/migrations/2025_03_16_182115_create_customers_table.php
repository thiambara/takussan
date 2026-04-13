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
        Schema::create('customers', function (Blueprint $table) {
            $table->id();

            // Informations de base
            $table->string('first_name');
            $table->string('last_name');
            $table->string('email')->unique()->nullable();
            $table->string('phone')->unique()->nullable();
            $table->date('birth_date')->nullable();

            // Statut et gestion
            $table->string('status')->default('active'); //  ['active', 'inactive', 'blocked', 'deleted'];
            $table->foreignId('added_by_id')->nullable()->constrained('users')->onDelete('set null');

            // Relation utilisateur (One-to-One)
            $table->foreignId('user_id')->nullable()->unique()->constrained('users')->onDelete('set null');

            $table->json('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
