<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_profiles', function (Blueprint $table) {
            $table->id();

            // One profile per user — enforced at the database level so the
            // observer / service code can rely on `firstOrCreate` semantics
            // without race-prone "check then insert" patterns.
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();

            $table->string('level', 32)->default('viewer');

            $table->foreignId('granted_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('granted_at')->useCurrent();
            $table->dateTime('revoked_at')->nullable();
            $table->text('notes')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index('level');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_profiles');
    }
};
