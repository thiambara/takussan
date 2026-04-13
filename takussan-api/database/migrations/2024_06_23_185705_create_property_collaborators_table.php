<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('property_collaborators', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained('properties')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->string('role');
            $table->json('permissions');

            $table->text('notes')->nullable();
            $table->foreignId('invited_by')->nullable()->constrained('users');
            $table->boolean('invitation_accepted')->default(false);
            $table->timestamp('invitation_date')->useCurrent();
            $table->timestamp('accepted_date')->nullable();

            $table->timestamps();

            // Contrainte d'unicité
            $table->unique(['property_id', 'user_id', 'role'], 'unique_property_user_role');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('property_collaborators');
    }
};
