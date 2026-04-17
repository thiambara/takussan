<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('properties', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('agency_id')->nullable()->constrained('agencies')->nullOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('properties')->nullOnDelete();
            $table->string('reference_number')->nullable()->unique();
            $table->string('title');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->string('type');
            $table->string('contract_type');
            $table->string('title_type')->nullable();
            $table->string('status')->default('available');
            $table->string('visibility')->default('public');
            $table->decimal('price', 14, 2);
            $table->string('currency', 3)->default('XOF');
            $table->unsignedInteger('area')->nullable();
            $table->unsignedTinyInteger('bedrooms')->nullable();
            $table->unsignedTinyInteger('bathrooms')->nullable();
            $table->boolean('furnished')->default(false);
            $table->unsignedSmallInteger('floor_number')->nullable();
            $table->unsignedSmallInteger('total_floors')->nullable();
            $table->unsignedSmallInteger('year_built')->nullable();
            $table->unsignedSmallInteger('parking_spaces')->nullable();
            $table->boolean('featured')->default(false);
            $table->unsignedInteger('views_count')->default(0);
            $table->unsignedInteger('favorites_count')->default(0);
            $table->unsignedInteger('visits_count')->default(0);
            $table->unsignedInteger('reviews_count')->default(0);
            $table->decimal('average_rating', 3, 2)->nullable();
            $table->date('available_from')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->json('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['status', 'contract_type']);
            $table->index(['user_id']);
            $table->index(['agency_id']);
            $table->index(['visibility', 'published_at']);
            $table->index(['featured', 'published_at']);
            $table->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('properties');
    }
};
