<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('broker_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->restrictOnDelete();
            $table->string('license_number')->unique();
            $table->string('insurance_policy_id')->nullable();
            $table->string('regulator_registration')->nullable();
            $table->date('active_until')->nullable();
            $table->json('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('broker_profiles');
    }
};
