<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_provider_agency_collaborations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_provider_profile_id')
                ->constrained('service_provider_profiles', 'id', 'sp_agency_collab_spp_fk')
                ->cascadeOnDelete();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->string('status')->default('active');
            $table->date('started_at');
            $table->date('ended_at')->nullable();
            $table->jsonb('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->unique(['service_provider_profile_id', 'agency_id'], 'sp_agency_collab_unique');
            $table->index(['agency_id', 'status']);
            $table->index('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_provider_agency_collaborations');
    }
};
