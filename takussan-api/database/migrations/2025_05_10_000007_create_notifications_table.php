<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');

            // Contenu
            $table->string('type');
            $table->string('title');
            $table->text('content');

            // Référence
            $table->bigInteger('reference_id')->nullable()->index();
            $table->string('reference_type')->nullable()->index();

            // État
            $table->boolean('is_read')->default(false)->index();
            $table->timestamp('read_at')->nullable();
            $table->boolean('is_actioned')->default(false);
            $table->timestamp('actioned_at')->nullable();

            // Délivrance
            $table->boolean('delivered')->default(false);
            $table->string('delivery_channel')->default('app');
            $table->timestamp('delivered_at')->nullable();

            // Timestamps
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
