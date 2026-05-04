<?php

use Illuminate\Database\Migrations\Migration;

/**
 * TCK-142 — Marked as no-op. The `users.type` column it used to fix is dropped
 * by the cutover migration (`drop_type_and_agency_id_from_users`). Kept as an
 * empty migration so prior environments still see a recorded run history and
 * Laravel doesn't try to re-apply the original DDL on an absent column.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Intentionally empty — see class docblock.
    }

    public function down(): void
    {
        // Intentionally empty — see class docblock.
    }
};
