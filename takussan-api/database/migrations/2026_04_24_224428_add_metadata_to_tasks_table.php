<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * TCK-083 — adds a free-form `metadata` JSON column on `tasks`. The
     * `tasks:send-due-reminders` scheduled command persists a marker into
     * this payload (`reminder_24h_sent_at`) so re-runs never double-send.
     */
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->jsonb('metadata')->nullable()->after('priority');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn('metadata');
        });
    }
};
