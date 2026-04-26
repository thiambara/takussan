<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-103 — Add global email digest frequency settings to users.
 *
 * These fields control the digest scheduling:
 *  - email_frequency: instant (transactional) | daily | weekly | off
 *  - digest_send_at:  local time to send digest (HH:MM, default 08:00)
 *  - digest_day_of_week: day for weekly digest (default monday)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('email_frequency', 16)->default('instant')->after('notifications_sms_enabled');
            $table->string('digest_send_at', 5)->default('08:00')->after('email_frequency');
            $table->string('digest_day_of_week', 16)->default('monday')->after('digest_send_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['email_frequency', 'digest_send_at', 'digest_day_of_week']);
        });
    }
};
