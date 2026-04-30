<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->string('key');
            $table->json('value');
            $table->string('scope')->default('global');
            $table->unsignedBigInteger('scope_id')->nullable();
            $table->foreignId('updated_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['key', 'scope', 'scope_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};
