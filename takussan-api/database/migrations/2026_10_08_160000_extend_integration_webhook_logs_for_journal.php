<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-602 (ADR-0051 §4) — le journal des webhooks entrants : une ligne écrite AVANT tout
 * traitement, sur tous les canaux (paiement, SMS, WhatsApp), au corps gardé tel que reçu et
 * chiffré, et dont `payload` n'est plus que la vue expurgée.
 *
 * `body` est un `text` (cast `encrypted`), jamais un `jsonb` : PostgreSQL normalise un `jsonb`
 * (espaces, ordre des clés), et un HMAC calculé sur les octets bruts ne se revérifie plus (TCK-343).
 *
 * Les anciennes lignes gardaient dans `payload.truncated` le corps EN CLAIR, numéros compris :
 * elles sont expurgées ici (le corps ne se reconstruit pas, il était tronqué à 4000 caractères).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('integration_webhook_logs', function (Blueprint $table): void {
            $table->string('channel', 20)->default('payment');
            // Le NOM de la route (jamais l'URL, qui porte des segments secrets) : le rejeu y lit
            // quel gestionnaire rappeler.
            $table->string('route_name', 60)->nullable();
            $table->foreignId('agency_id')->nullable()->constrained('agencies', 'id', 'iwl_agency_fk')->nullOnDelete();
            $table->text('body')->nullable();
            $table->char('body_sha256', 64)->nullable();
            $table->boolean('body_truncated')->default(false);
            $table->text('headers')->nullable();
            $table->string('http_method', 10)->nullable();
            $table->timestamp('authenticated_at')->nullable();
            $table->unsignedSmallInteger('http_status')->nullable();
            $table->string('error_code', 120)->nullable();
            $table->string('error_message', 255)->nullable();
            $table->string('external_id', 191)->nullable();
            $table->unsignedInteger('matched_count')->nullable();
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('replayed_at')->nullable();
            $table->foreignId('replayed_by_id')->nullable()->constrained('users', 'id', 'iwl_replayed_by_fk')->nullOnDelete();

            $table->index(['status', 'created_at'], 'iwl_status_created_idx');
            $table->index(['channel', 'provider', 'created_at'], 'iwl_channel_provider_created_idx');
            $table->index(['agency_id', 'created_at'], 'iwl_agency_created_idx');
            $table->index('external_id', 'iwl_external_id_idx');
        });

        DB::table('integration_webhook_logs')->update(['payload' => json_encode(['legacy' => true])]);
    }

    public function down(): void
    {
        Schema::table('integration_webhook_logs', function (Blueprint $table): void {
            $table->dropIndex('iwl_status_created_idx');
            $table->dropIndex('iwl_channel_provider_created_idx');
            $table->dropIndex('iwl_agency_created_idx');
            $table->dropIndex('iwl_external_id_idx');
            $table->dropForeign('iwl_agency_fk');
            $table->dropForeign('iwl_replayed_by_fk');
            $table->dropColumn([
                'channel', 'route_name', 'agency_id', 'body', 'body_sha256', 'body_truncated', 'headers', 'http_method',
                'authenticated_at', 'http_status', 'error_code', 'error_message', 'external_id',
                'matched_count', 'attempts', 'replayed_at', 'replayed_by_id',
            ]);
        });
    }
};
