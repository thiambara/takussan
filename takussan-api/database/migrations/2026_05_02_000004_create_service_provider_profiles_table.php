<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_provider_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->restrictOnDelete();
            $table->json('specialties')->nullable();
            $table->json('service_areas')->nullable();
            $table->string('insurance_policy_id')->nullable();
            $table->json('certifications')->nullable();
            $table->decimal('hourly_rate_min', 10, 2)->nullable();
            $table->decimal('hourly_rate_max', 10, 2)->nullable();
            $table->date('active_until')->nullable();
            $table->json('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_provider_profiles');
    }
};
