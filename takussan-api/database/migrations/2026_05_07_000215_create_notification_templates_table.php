<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_templates', function (Blueprint $table) {
            $table->id();
            $table->string('event');
            $table->string('channel');
            $table->string('locale', 5);
            $table->string('subject')->nullable();
            $table->text('body');
            $table->boolean('is_active')->default(true);
            $table->foreignId('updated_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['event', 'channel', 'locale']);
            $table->index(['event', 'channel', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_templates');
    }
};
