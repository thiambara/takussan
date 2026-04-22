<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversation_participants', function (Blueprint $table) {
            if (! Schema::hasColumn('conversation_participants', 'archived_at')) {
                $table->timestamp('archived_at')->nullable()->after('is_muted');
                $table->index(['user_id', 'archived_at'], 'conversation_participants_user_archived_index');
            }
        });
    }

    public function down(): void
    {
        Schema::table('conversation_participants', function (Blueprint $table) {
            if (Schema::hasColumn('conversation_participants', 'archived_at')) {
                $table->dropIndex('conversation_participants_user_archived_index');
                $table->dropColumn('archived_at');
            }
        });
    }
};
