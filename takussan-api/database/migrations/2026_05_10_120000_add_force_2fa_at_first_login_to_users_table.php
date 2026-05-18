<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-263 — adds the `force_2fa_at_first_login` flag used by the
 * super-admin bootstrap command (and later by the cooptation flow,
 * TCK-264) to require a fresh 2FA enrollment on the very first web
 * sign-in. The 2FA secret + recovery codes columns themselves were
 * provisioned by `add_fields_to_users_table` (P1 placeholder); this
 * migration only adds the missing flag, idempotently.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'force_2fa_at_first_login')) {
                $table->boolean('force_2fa_at_first_login')
                    ->default(false)
                    ->after('two_factor_recovery_codes');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'force_2fa_at_first_login')) {
                $table->dropColumn('force_2fa_at_first_login');
            }
        });
    }
};
