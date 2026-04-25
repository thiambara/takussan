<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table): void {
            $table->timestamp('last_reminder_sent_at')->nullable()->after('due_date');
            $table->unsignedTinyInteger('reminders_sent_count')->default(0)->after('last_reminder_sent_at');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table): void {
            $table->dropColumn(['last_reminder_sent_at', 'reminders_sent_count']);
        });
    }
};
