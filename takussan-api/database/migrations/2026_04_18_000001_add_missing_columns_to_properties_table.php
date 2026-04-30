<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->string('lot_position')->nullable()->after('parking_spaces');
            $table->unsignedSmallInteger('level')->nullable()->after('lot_position');
            $table->boolean('admin_monitored')->default(false)->after('level');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropColumn(['lot_position', 'level', 'admin_monitored']);
        });
    }
};
