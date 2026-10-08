<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-592 — ADR-0037 : le plafond de travaux du bailleur, porté par la relation bailleur–agence.
 * `null` = pas d'accord requis (comportement d'avant, et état de toutes les lignes existantes).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('owner_profiles', function (Blueprint $table): void {
            $table->decimal('works_approval_threshold', 14, 2)->nullable()->after('monthly_income');
        });
    }

    public function down(): void
    {
        Schema::table('owner_profiles', function (Blueprint $table): void {
            $table->dropColumn('works_approval_threshold');
        });
    }
};
