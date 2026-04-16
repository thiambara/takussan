<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->index(['status', 'featured', 'published_at']);
            $table->index(['status', 'price']);
            $table->index(['status', 'bedrooms']);
            $table->index(['status', 'location_quarter']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropIndex(['status', 'featured', 'published_at']);
            $table->dropIndex(['status', 'price']);
            $table->dropIndex(['status', 'bedrooms']);
            $table->dropIndex(['status', 'location_quarter']);
        });
    }
};
