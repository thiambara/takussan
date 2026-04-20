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
        // Change default from 'individual' to 'owner' to match UserType enum
        // Note: SQLite doesn't support altering defaults directly, so we recreate the column
        Schema::table('users', function (Blueprint $table) {
            $table->string('type')->default('owner')->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('type')->default('individual')->change();
        });
    }
};
