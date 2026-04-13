<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->nullableMorphs('loggable');

            // Informations sur l'action
            $table->string('action', 100);
            $table->text('description');

            // Modifications
            $table->json('changes')->nullable();

            // Informations contextuelles
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();

            // Timestamp de création
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
    }
};
