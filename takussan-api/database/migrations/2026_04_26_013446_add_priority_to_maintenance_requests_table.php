<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('maintenance_requests')
            ->where('priority', 'medium')
            ->update(['priority' => 'normal']);

        Schema::table('maintenance_requests', function (Blueprint $table) {
            $table->string('priority')->default('normal')->change();
        });
    }

    public function down(): void
    {
        Schema::table('maintenance_requests', function (Blueprint $table) {
            $table->string('priority')->default('medium')->change();
        });

        DB::table('maintenance_requests')
            ->where('priority', 'normal')
            ->update(['priority' => 'medium']);
    }
};
