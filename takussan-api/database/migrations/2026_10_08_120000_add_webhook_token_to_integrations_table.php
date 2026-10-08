<?php

use App\Models\Enums\PaymentProvider;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * TCK-293 (ADR-0046) — le jeton de l'URL de webhook d'une intégration de paiement.
 *
 * `webhook_token_hash` (SHA-256, unique) sert à la recherche ; `webhook_token` porte le clair
 * chiffré par `APP_KEY` (cast `encrypted`), relu pour `notif_url` d'Orange Money et l'écran Wave.
 * Les intégrations de paiement existantes reçoivent leur jeton ici : sans lui, elles ne
 * recevraient plus aucun webhook, l'ancienne route rendant 410.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('integrations', function (Blueprint $table) {
            $table->char('webhook_token_hash', 64)->nullable();
            $table->text('webhook_token')->nullable();
            $table->unique('webhook_token_hash', 'integrations_webhook_token_hash_unique');
        });

        $providers = array_map(fn (PaymentProvider $p) => $p->value, PaymentProvider::cases());

        DB::table('integrations')
            ->whereIn('provider', $providers)
            ->whereNull('webhook_token_hash')
            ->orderBy('id')
            ->get(['id'])
            ->each(function (object $row): void {
                $token = Str::random(48);
                DB::table('integrations')->where('id', $row->id)->update([
                    'webhook_token_hash' => hash('sha256', $token),
                    'webhook_token' => Crypt::encryptString($token),
                ]);
            });
    }

    public function down(): void
    {
        // Les jetons se régénèrent d'un geste : les perdre ne perd aucune donnée métier.
        Schema::table('integrations', function (Blueprint $table) {
            $table->dropUnique('integrations_webhook_token_hash_unique');
            $table->dropColumn(['webhook_token_hash', 'webhook_token']);
        });
    }
};
