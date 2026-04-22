<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reviews', function (Blueprint $table) {
            if (! Schema::hasColumn('reviews', 'status')) {
                $table->string('status')->default('pending')->after('is_approved');
                $table->index(['reviewable_type', 'reviewable_id', 'status'], 'reviews_reviewable_status_index');
            }
            if (! Schema::hasColumn('reviews', 'reported_count')) {
                $table->unsignedInteger('reported_count')->default(0)->after('status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('reviews', function (Blueprint $table) {
            if (Schema::hasColumn('reviews', 'reported_count')) {
                $table->dropColumn('reported_count');
            }
            if (Schema::hasColumn('reviews', 'status')) {
                $table->dropIndex('reviews_reviewable_status_index');
                $table->dropColumn('status');
            }
        });
    }
};
