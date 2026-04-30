<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->foreign('maintenance_request_id')
                ->references('id')->on('maintenance_requests')->nullOnDelete();
            $table->foreign('last_message_id')
                ->references('id')->on('messages')->nullOnDelete();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreign('agency_id')->references('id')->on('agencies')->nullOnDelete();
            $table->foreign('added_by_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropForeign(['maintenance_request_id']);
            $table->dropForeign(['last_message_id']);
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['agency_id']);
            $table->dropForeign(['added_by_id']);
        });
    }
};
