<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained('properties')->restrictOnDelete();
            $table->foreignId('landlord_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('tenant_id')->constrained('customers')->restrictOnDelete();
            $table->foreignId('agency_id')->nullable()->constrained('agencies')->nullOnDelete();
            $table->foreignId('booking_id')->nullable()->constrained('bookings')->nullOnDelete();
            $table->foreignId('renewed_from_lease_id')->nullable()->constrained('leases')->nullOnDelete();
            $table->foreignId('guarantor_id')->nullable()->constrained('guarantors')->nullOnDelete();
            $table->string('reference_number')->unique();
            $table->string('type');
            $table->string('status')->default('draft');
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->date('renewal_date')->nullable();
            $table->decimal('monthly_rent', 14, 2)->nullable();
            $table->decimal('sale_price', 14, 2)->nullable();
            $table->string('currency', 3)->default('XOF');
            $table->decimal('deposit_amount', 14, 2)->nullable();
            $table->decimal('commission_amount', 14, 2)->nullable();
            $table->decimal('commission_rate', 5, 2)->nullable();
            $table->string('payment_frequency')->default('monthly');
            $table->unsignedTinyInteger('payment_day')->nullable();
            $table->text('terms')->nullable();
            $table->text('special_conditions')->nullable();
            $table->timestamp('signed_at')->nullable();
            $table->timestamp('terminated_at')->nullable();
            $table->text('termination_reason')->nullable();
            $table->foreignId('terminated_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['status', 'property_id']);
            $table->index('landlord_id');
            $table->index('tenant_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leases');
    }
};
