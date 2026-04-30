<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-076 — capture immuable signature payloads (SVG base64) + tamper hash
 * + final `signed_at` when both parties have signed.
 *
 * Previous migration only stored boolean + timestamp. The data column and the
 * SHA-256 hash are additive: no existing row needs backfilling since those
 * inventories never captured a signature payload.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventories', function (Blueprint $table) {
            $table->text('tenant_signature_data')->nullable()->after('tenant_signed_at');
            $table->string('tenant_signature_hash', 64)->nullable()->after('tenant_signature_data');
            $table->text('owner_signature_data')->nullable()->after('owner_signed_at');
            $table->string('owner_signature_hash', 64)->nullable()->after('owner_signature_data');
            $table->timestamp('signed_at')->nullable()->after('owner_signature_hash');
        });
    }

    public function down(): void
    {
        Schema::table('inventories', function (Blueprint $table) {
            $table->dropColumn([
                'tenant_signature_data',
                'tenant_signature_hash',
                'owner_signature_data',
                'owner_signature_hash',
                'signed_at',
            ]);
        });
    }
};
