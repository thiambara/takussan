<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agencies', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('license_number')->nullable()->unique();
            $table->text('description')->nullable();
            $table->string('email')->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('website')->nullable();
            $table->decimal('commission_rate', 5, 2)->nullable();
            $table->date('founded_at')->nullable();
            $table->boolean('is_verified')->default(false);
            $table->timestamp('verified_at')->nullable();
            $table->foreignId('primary_admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status')->default('active');
            $table->unsignedInteger('properties_count')->default(0);
            $table->unsignedInteger('active_leases_count')->default(0);
            $table->decimal('average_rating', 3, 2)->nullable();
            $table->json('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agencies');
    }
};
