<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->string('subject')->nullable();
            $table->foreignId('property_id')->nullable()->constrained('properties')->nullOnDelete();
            $table->foreignId('lease_id')->nullable()->constrained('leases')->nullOnDelete();
            $table->unsignedBigInteger('maintenance_request_id')->nullable();
            $table->string('type')->default('direct');
            $table->string('status')->default('active');
            $table->foreignId('created_by')->constrained('users');
            $table->unsignedBigInteger('last_message_id')->nullable();
            $table->string('last_message_preview', 255)->nullable();
            $table->timestamp('last_message_at')->nullable();
            $table->jsonb('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['property_id', 'lease_id', 'maintenance_request_id'], 'conversations_parent_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('conversations');
    }
};
