<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->boolean('is_test')->default(false)->after('admin_monitored');
            $table->index(['is_test', 'visibility']);
        });

        // Backfill: every fixture seeded under the synthetic naming pattern
        // ("Property Test Filter -*") and the placeholder featured trio
        // ("Propriété Premium Featured" priced at 999,999,999) is flagged
        // so the public API drops them automatically.
        DB::table('properties')
            ->where(function ($q) {
                $q->where('title', 'like', 'Property Test Filter -%')
                    ->orWhere(function ($qq) {
                        $qq->where('title', 'Propriété Premium Featured')
                            ->where('price', 999_999_999);
                    });
            })
            ->update(['is_test' => true]);
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropIndex(['is_test', 'visibility']);
            $table->dropColumn('is_test');
        });
    }
};
