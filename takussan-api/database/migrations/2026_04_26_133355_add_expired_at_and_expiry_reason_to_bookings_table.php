<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            if (! Schema::hasColumn('bookings', 'expired_at')) {
                $table->timestamp('expired_at')->nullable()->after('expires_at');
            }
            if (! Schema::hasColumn('bookings', 'expiry_reason')) {
                $table->string('expiry_reason')->nullable()->after('expired_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            if (Schema::hasColumn('bookings', 'expired_at')) {
                $table->dropColumn('expired_at');
            }
            if (Schema::hasColumn('bookings', 'expiry_reason')) {
                $table->dropColumn('expiry_reason');
            }
        });
    }
};
