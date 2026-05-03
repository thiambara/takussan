<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('broker_agency_collaborations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('broker_profile_id')->constrained('broker_profiles')->cascadeOnDelete();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->string('status')->default('active');
            $table->date('started_at');
            $table->date('ended_at')->nullable();
            $table->json('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->unique(['broker_profile_id', 'agency_id'], 'broker_agency_collab_unique');
            $table->index(['agency_id', 'status']);
            $table->index('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('broker_agency_collaborations');
    }
};
