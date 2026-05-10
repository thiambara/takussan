<?php

use App\Models\Profiles\OwnerProfile;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-271 — materialize the `AgencyAdminProfile` so the
 * `ResolveActiveProfile` middleware can pin a concrete profile for the
 * "agency admin" context, in lockstep with the spatie `agency_admin`
 * role attached to the user under `team_id = agency.id`.
 *
 * Schema mirrors {@see OwnerProfile} on purpose — the
 * agency_admin profile is intentionally lean (it only carries the link
 * to the agency + a status); it does not hold KYC or financial data.
 *
 * `user_id` is nullable for parity with owner/agent profiles (TCK-256/258
 * draft state — kept here to leave the door open for an "invite a
 * co-admin" flow in a later ticket without a follow-up migration).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agency_admin_profiles', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('agency_id')->constrained('agencies')->restrictOnDelete();
            $table->string('status')->default('active');
            $table->json('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            // PostgreSQL and MySQL both allow multiple NULLs in a multi-column
            // unique — drafts (no `user_id` yet) can coexist per agency.
            $table->unique(['user_id', 'agency_id']);
            $table->index(['agency_id', 'status']);
            $table->index('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agency_admin_profiles');
    }
};
