<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-085 — System messages have no human author. Drop the FK constraint
 * so we can null `sender_id`, then re-add it as a SET NULL on delete to
 * preserve referential integrity.
 *
 * Additive: the column itself already exists (TCK-029 migration). We
 * relax NOT NULL and switch the FK action.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            // Drop the existing FK first; SQLite tolerates dropForeign as a no-op.
            try {
                $table->dropForeign(['sender_id']);
            } catch (Throwable) {
                // already absent
            }
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->foreignId('sender_id')->nullable()->change();
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->foreign('sender_id')
                ->references('id')->on('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            try {
                $table->dropForeign(['sender_id']);
            } catch (Throwable) {
                // ignore
            }
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->foreignId('sender_id')->nullable(false)->change();
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->foreign('sender_id')->references('id')->on('users');
        });
    }
};
