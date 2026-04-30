<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('property_price_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained('properties')->cascadeOnDelete();
            $table->foreignId('changed_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('old_price', 14, 2)->nullable();
            $table->decimal('new_price', 14, 2);
            $table->string('currency', 3)->default('XOF');
            $table->string('reason')->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('changed_at');
            $table->timestamp('created_at')->nullable();

            $table->index(['property_id', 'changed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('property_price_histories');
    }
};
