<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-253 — Add `preferences` JSON column to `users`.
 *
 * Holds opt-in personalisation hints set via the deferred minimal-profile
 * sheet (city, search_intent). Distinct from `metadata` which is internal
 * back-office state — `preferences` is user-owned and exposed via API.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->jsonb('preferences')->nullable()->after('metadata');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('preferences');
        });
    }
};
