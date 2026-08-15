<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-283 — Extend the notification template registry with the columns
 * needed to map a `channel = 'whatsapp'` row onto an approved Meta template
 * (used for outbound sends outside the 24h service window). See
 * models-spec §55.
 *
 * `meta_variables` is a nullable JSON (no DEFAULT on JSON — MySQL gotcha,
 * CLAUDE.md); the model casts it to an array defaulting to `[]`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_templates', function (Blueprint $table) {
            $table->string('meta_template_name')->nullable()->after('body');
            $table->string('meta_category')->nullable()->after('meta_template_name');
            $table->string('meta_status')->nullable()->after('meta_category');
            $table->json('meta_variables')->nullable()->after('meta_status');
        });
    }

    public function down(): void
    {
        Schema::table('notification_templates', function (Blueprint $table) {
            $table->dropColumn(['meta_template_name', 'meta_category', 'meta_status', 'meta_variables']);
        });
    }
};
