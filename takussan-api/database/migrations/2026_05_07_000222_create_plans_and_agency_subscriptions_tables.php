<?php

use App\Models\Enums\AgencySubscriptionStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plans', function (Blueprint $table): void {
            $table->id();
            $table->string('code')->unique();
            $table->string('label');
            $table->text('description')->nullable();
            $table->decimal('monthly_price_xof', 12, 2)->default(0);
            $table->decimal('platform_fee_pct', 5, 2)->default(0);
            $table->unsignedSmallInteger('trial_days')->default(0);
            $table->json('limits')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });

        Schema::create('agency_subscriptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained('plans')->restrictOnDelete();
            $table->string('status')->default(AgencySubscriptionStatus::Trialing->value)->index();
            $table->timestamp('trial_ends_at')->nullable();
            $table->timestamp('current_period_start');
            $table->timestamp('current_period_end');
            $table->timestamp('ended_at')->nullable();
            $table->decimal('platform_fee_pct_override', 5, 2)->nullable();
            $table->json('limits_override')->nullable();
            $table->timestamps();

            $table->index(['agency_id', 'ended_at']);
        });

        $driver = DB::getDriverName();
        if (in_array($driver, ['pgsql', 'sqlite'], true)) {
            DB::statement('CREATE UNIQUE INDEX agency_subscriptions_one_open_per_agency ON agency_subscriptions (agency_id) WHERE ended_at IS NULL');
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();
        if (in_array($driver, ['pgsql', 'sqlite'], true)) {
            DB::statement('DROP INDEX IF EXISTS agency_subscriptions_one_open_per_agency');
        }

        Schema::dropIfExists('agency_subscriptions');
        Schema::dropIfExists('plans');
    }
};
