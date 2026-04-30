<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->nullableMorphs('taskable');
            $table->foreignId('assigned_to_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('due_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->string('status')->default('open');
            $table->string('priority')->default('medium');
            $table->softDeletes();
            $table->timestamps();

            $table->index(['assigned_to_id', 'due_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
