<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('user_customer_relationships', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('customer_id')->constrained('customers')->onDelete('cascade');

            // Type de relation
            $table->string('relationship_type', 50);

            // État de la relation
            $table->boolean('is_primary')->default(false);
            $table->string('status', 50)->default('active');

            // Dates clés
            $table->timestamp('start_date')->useCurrent();
            $table->timestamp('end_date')->nullable();

            // Informations supplémentaires
            $table->text('notes')->nullable();

            // Timestamps
            $table->timestamps();

            // Contraintes
            $table->unique(['customer_id', 'relationship_type', 'is_primary'], 'unique_primary_relationship');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_customer_relationships');
    }
};
