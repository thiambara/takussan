<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2399 — la raison de fin d'une réponse (`stop`, `length`, `content_filter`… de
 * `Laravel\Ai\Responses\Data\FinishReason`). Sans elle, une réponse tronquée ou filtrée passait
 * pour un succès. Nulle pour un refus, un cache ou une exception.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_calls', function (Blueprint $table) {
            $table->string('stop_reason', 20)->nullable()->after('outcome');
        });
    }

    public function down(): void
    {
        Schema::table('ai_calls', function (Blueprint $table) {
            $table->dropColumn('stop_reason');
        });
    }
};
