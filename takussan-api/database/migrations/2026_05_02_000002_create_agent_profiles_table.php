<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agent_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('agency_id')->constrained('agencies')->restrictOnDelete();
            $table->string('status')->default('active');
            $table->string('license_number')->nullable();
            $table->decimal('commission_rate', 5, 2)->nullable();
            $table->string('specialty')->nullable();
            $table->date('hire_date')->nullable();
            $table->date('active_until')->nullable();
            $table->jsonb('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->unique(['user_id', 'agency_id']);
            $table->index(['agency_id', 'status']);
            $table->index('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agent_profiles');
    }
};
