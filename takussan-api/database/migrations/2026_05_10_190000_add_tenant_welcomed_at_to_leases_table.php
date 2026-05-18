<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-265 — `tenant_welcomed_at` on `leases`.
 *
 * Idempotence sentinel for the welcome notification fired by
 * `SendTenantWelcomeNotification` on `LeaseActivated`. A non-null
 * value means the tenant was already greeted on this lease — every
 * subsequent activation of the same row (e.g. a lease bounced through
 * draft → active a second time during ops support) is a no-op.
 *
 * Stored on the lease itself rather than derived from `app_notifications`
 * for clarity and so the listener stays cheap (one indexed PK lookup
 * instead of a query on a much larger table).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            if (! Schema::hasColumn('leases', 'tenant_welcomed_at')) {
                $table->timestamp('tenant_welcomed_at')->nullable()->after('signed_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            if (Schema::hasColumn('leases', 'tenant_welcomed_at')) {
                $table->dropColumn('tenant_welcomed_at');
            }
        });
    }
};
