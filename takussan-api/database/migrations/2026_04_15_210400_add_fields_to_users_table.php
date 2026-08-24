<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Drop old name column (replaced by first_name + last_name)
            $table->dropColumn('name');

            // Identity
            $table->string('username')->nullable()->unique()->after('id');
            $table->string('first_name')->after('username');
            $table->string('last_name')->after('first_name');
            $table->string('type')->default('individual')->after('last_name');
            $table->string('status')->default('active')->after('type');

            // Contact
            $table->string('phone', 30)->nullable()->after('email');
            $table->timestamp('phone_verified_at')->nullable()->after('phone');

            // Profile
            $table->text('bio')->nullable()->after('email_verified_at');
            $table->string('preferred_language', 10)->default('fr')->after('bio');
            $table->string('timezone', 50)->default('Africa/Dakar')->after('preferred_language');

            // Timestamps
            $table->timestamp('last_login_at')->nullable()->after('timezone');

            // Relations
            $table->unsignedBigInteger('agency_id')->nullable()->after('last_login_at');
            $table->unsignedBigInteger('added_by_id')->nullable()->after('agency_id');

            // OAuth
            $table->string('google_id')->nullable()->after('added_by_id');
            $table->string('facebook_id')->nullable()->after('google_id');
            $table->string('apple_id')->nullable()->after('facebook_id');

            // 2FA (P1 — columns created now, configured later)
            $table->boolean('two_factor_enabled')->default(false)->after('apple_id');
            $table->text('two_factor_secret')->nullable()->after('two_factor_enabled');
            $table->text('two_factor_recovery_codes')->nullable()->after('two_factor_secret');

            // Notification prefs
            $table->boolean('notifications_email_enabled')->default(true)->after('two_factor_recovery_codes');
            $table->boolean('notifications_push_enabled')->default(true)->after('notifications_email_enabled');
            $table->boolean('notifications_sms_enabled')->default(false)->after('notifications_push_enabled');

            // Misc
            $table->jsonb('metadata')->nullable()->after('notifications_sms_enabled');
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropSoftDeletes();
            $table->dropColumn([
                'username', 'first_name', 'last_name', 'type', 'status',
                'phone', 'phone_verified_at',
                'bio', 'preferred_language', 'timezone',
                'last_login_at', 'agency_id', 'added_by_id',
                'google_id', 'facebook_id', 'apple_id',
                'two_factor_enabled', 'two_factor_secret', 'two_factor_recovery_codes',
                'notifications_email_enabled', 'notifications_push_enabled', 'notifications_sms_enabled',
                'metadata',
            ]);
            $table->string('name')->after('id');
        });
    }
};
