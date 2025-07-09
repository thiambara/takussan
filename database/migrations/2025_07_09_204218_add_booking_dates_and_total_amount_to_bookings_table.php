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
        Schema::table('bookings', function (Blueprint $table) {
            $table->timestamp('start_date')->nullable()->after('booking_date');
            $table->timestamp('end_date')->nullable()->after('start_date');
            $table->decimal('total_amount', 14, 2)->nullable()->after('price_at_booking');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn(['start_date', 'end_date', 'total_amount']);
        });
    }
};
