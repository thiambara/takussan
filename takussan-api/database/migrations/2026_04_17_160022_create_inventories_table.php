<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lease_id')->constrained('leases')->cascadeOnDelete();
            $table->foreignId('property_id')->constrained('properties')->cascadeOnDelete();
            $table->string('type');
            $table->foreignId('conducted_by')->constrained('users');
            $table->foreignId('tenant_id')->constrained('customers')->restrictOnDelete();
            $table->timestamp('conducted_at');
            $table->string('status')->default('draft');
            $table->string('general_condition');
            $table->jsonb('rooms');
            $table->text('notes')->nullable();
            $table->boolean('tenant_signed')->default(false);
            $table->timestamp('tenant_signed_at')->nullable();
            $table->boolean('owner_signed')->default(false);
            $table->timestamp('owner_signed_at')->nullable();
            $table->jsonb('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('lease_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventories');
    }
};
