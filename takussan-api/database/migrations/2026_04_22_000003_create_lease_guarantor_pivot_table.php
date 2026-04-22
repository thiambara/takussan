<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lease_guarantor', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lease_id')->constrained('leases')->cascadeOnDelete();
            $table->foreignId('guarantor_id')->constrained('guarantors')->cascadeOnDelete();
            $table->string('role')->nullable();
            $table->timestamps();

            $table->unique(['lease_id', 'guarantor_id'], 'lease_guarantor_unique');
            $table->index('lease_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lease_guarantor');
    }
};
