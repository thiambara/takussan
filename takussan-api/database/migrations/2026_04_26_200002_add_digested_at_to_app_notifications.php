<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-103 — Track which notifications have been included in a digest.
 *
 * Once set, `digested_at` prevents the notification from being included
 * in a subsequent digest run (idempotence guarantee).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_notifications', function (Blueprint $table) {
            $table->timestamp('digested_at')->nullable()->after('sent_at');
            $table->index(['user_id', 'digested_at']);
        });
    }

    public function down(): void
    {
        Schema::table('app_notifications', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'digested_at']);
            $table->dropColumn('digested_at');
        });
    }
};
