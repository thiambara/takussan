<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('reviews', function (Blueprint $table) {
            $table->id();
            $table->morphs('model');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');

            // Contenu
            $table->decimal('rating', 2, 1);
            $table->string('title')->nullable();
            $table->text('content')->nullable();

            // Modération
            $table->boolean('is_approved')->default(false);
            $table->foreignId('approved_by')->nullable()->constrained('users');
            $table->timestamp('approved_at')->nullable();
            $table->integer('reported_count')->default(0);

            // Timestamps
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reviews');
    }
};
