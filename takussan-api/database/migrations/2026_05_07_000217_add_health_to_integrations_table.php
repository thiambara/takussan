<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('integrations', function (Blueprint $table): void {
            $table->timestamp('last_health_check_at')->nullable()->after('last_used_at');
            $table->string('health_status')->default('unknown')->after('last_health_check_at');
        });
    }

    public function down(): void
    {
        Schema::table('integrations', function (Blueprint $table): void {
            $table->dropColumn(['last_health_check_at', 'health_status']);
        });
    }
};
