<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-799 (P11.05) — un SMS envoyé sans notification (contact sans compte, code de signature de
 * bail) écrit aussi sa tentative : `app_notification_id` devient nullable. La clé étrangère et son
 * `cascadeOnDelete` restent.
 *
 * Le `down()` supprime d'abord les tentatives sans notification : la contrainte non nulle ne se
 * rétablit pas sur elles (décision du porteur).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_delivery_attempts', function (Blueprint $table) {
            $table->unsignedBigInteger('app_notification_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        DB::table('notification_delivery_attempts')->whereNull('app_notification_id')->delete();

        Schema::table('notification_delivery_attempts', function (Blueprint $table) {
            $table->unsignedBigInteger('app_notification_id')->nullable(false)->change();
        });
    }
};
