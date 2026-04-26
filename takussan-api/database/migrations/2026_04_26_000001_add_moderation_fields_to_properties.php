<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->text('rejection_reason')->nullable()->after('admin_monitored');
            $table->timestamp('submitted_at')->nullable()->after('rejection_reason');
            $table->timestamp('approved_at')->nullable()->after('submitted_at');
            $table->timestamp('rejected_at')->nullable()->after('approved_at');
            $table->foreignId('approved_by_user_id')->nullable()->after('rejected_at')
                ->constrained('users')->nullOnDelete();
            $table->foreignId('rejected_by_user_id')->nullable()->after('approved_by_user_id')
                ->constrained('users')->nullOnDelete();

            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropForeign(['approved_by_user_id']);
            $table->dropForeign(['rejected_by_user_id']);
            $table->dropColumn([
                'rejection_reason',
                'submitted_at',
                'approved_at',
                'rejected_at',
                'approved_by_user_id',
                'rejected_by_user_id',
            ]);
        });
    }
};
