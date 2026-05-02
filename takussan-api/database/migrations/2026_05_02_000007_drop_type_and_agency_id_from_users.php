<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-142 — Cutover. The polymorphic profiles (TCK-139/140/141) own agency
 * attachment and the user "nature" entirely. Both columns become unused
 * and are dropped to make the spec-vs-code drift impossible.
 *
 * **Irreversible in data.** `down()` recreates the columns nullable so the
 * schema matches the pre-cutover shape, but cannot restore the values that
 * disappeared with the column — a rollback would yield a User table with
 * NULL `type` / `agency_id` everywhere. The polymorphic profiles remain
 * regardless and are the ones the code reads from after this point.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Drop the FK constraint before the column on MySQL/Postgres;
            // SQLite (used in tests) doesn't enforce FK names so the call
            // is a no-op there.
            if (Schema::hasColumn('users', 'agency_id')) {
                try {
                    $table->dropForeign(['agency_id']);
                } catch (Throwable) {
                    // SQLite or already dropped — ignore.
                }
                $table->dropColumn('agency_id');
            }
            if (Schema::hasColumn('users', 'type')) {
                $table->dropColumn('type');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'type')) {
                $table->string('type')->nullable()->after('password');
            }
            if (! Schema::hasColumn('users', 'agency_id')) {
                $table->foreignId('agency_id')->nullable()->after('last_login_at')->constrained('agencies')->nullOnDelete();
            }
        });
    }
};
