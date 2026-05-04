<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('owner_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('agency_id')->constrained('agencies')->restrictOnDelete();
            $table->string('status')->default('active');
            $table->string('rib')->nullable();
            $table->string('tax_id')->nullable();
            $table->string('id_document_type')->nullable();
            $table->string('id_document_number')->nullable();
            $table->decimal('monthly_income', 14, 2)->nullable();
            $table->string('employer')->nullable();
            $table->foreignId('guarantor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->unique(['user_id', 'agency_id']);
            $table->index(['agency_id', 'status']);
            $table->index('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('owner_profiles');
    }
};
