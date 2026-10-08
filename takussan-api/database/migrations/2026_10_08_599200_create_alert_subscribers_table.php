<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-599 (ADR-0050 §4) — l'abonné sans compte : UNE LIGNE PAR DEMANDE (décision de session 1).
 *
 * Le contact et le jeton de désinscription sont chiffrés (cast `encrypted`, ADR-0044 §1) ; on les
 * retrouve par leur empreinte (`contact_hash` = HMAC sous `app.key`, `*_token_hash` = SHA-256).
 * Le jeton de confirmation n'est stocké QUE haché : il ne sert qu'une fois.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('alert_subscribers', function (Blueprint $table) {
            $table->id();
            $table->string('channel', 16);
            $table->text('contact');
            $table->string('contact_hash', 64);
            // verif-599 m1 — l'empreinte de la BOÎTE (`awa+x@` → `awa@`) : elle seule porte les
            // plafonds et le limiteur. `contact_hash` garde le contact tel que saisi (rattachement).
            $table->string('mailbox_hash', 64);
            $table->string('locale', 8)->default('fr');
            $table->string('confirmation_token_hash', 64)->nullable()->unique();
            $table->timestamp('confirmation_sent_at')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->text('unsubscribe_token');
            $table->string('unsubscribe_token_hash', 64)->unique();
            $table->timestamp('consent_at');
            $table->string('consent_source', 40);
            $table->string('consent_version', 40);
            $table->timestamps();

            $table->index(['contact_hash', 'confirmed_at'], 'alert_subscribers_contact_idx');
            $table->index('created_at', 'alert_subscribers_created_idx');
            $table->index(['mailbox_hash', 'confirmation_sent_at'], 'alert_subscribers_mailbox_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('alert_subscribers');
    }
};
