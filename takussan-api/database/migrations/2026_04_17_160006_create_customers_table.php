<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('agency_id')->nullable()->constrained('agencies')->nullOnDelete();
            $table->foreignId('added_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('first_name');
            $table->string('last_name');
            $table->string('email')->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('id_type')->nullable();
            $table->string('id_number')->nullable();
            $table->string('occupation')->nullable();
            $table->string('emergency_contact_name')->nullable();
            $table->string('emergency_contact_phone', 30)->nullable();
            $table->string('status')->default('active');
            $table->string('pipeline_stage')->default('lead');
            $table->text('notes')->nullable();
            $table->json('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('agency_id');
            $table->index('status');
            $table->index('pipeline_stage');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
