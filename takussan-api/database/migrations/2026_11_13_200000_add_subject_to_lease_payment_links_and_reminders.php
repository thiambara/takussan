<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2778 — ce qu'un lien de paiement fait payer, et ce qu'une relance notée relance
 * (`PaymentLinkSubject` : `rent`, `late_fee`). `rent` par défaut : tout lien et toute relance
 * antérieurs portaient sur le loyer (pénalité comprise quand l'agence l'encaisse en ligne), et
 * l'API refusait les deux gestes sur une échéance payée. Chaîne sans `enum()` SQL (ADR-0007).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lease_payment_links', function (Blueprint $table) {
            $table->string('subject', 16)->default('rent');
        });
        Schema::table('lease_payment_reminders', function (Blueprint $table) {
            $table->string('subject', 16)->default('rent');
        });
    }

    public function down(): void
    {
        Schema::table('lease_payment_links', function (Blueprint $table) {
            $table->dropColumn('subject');
        });
        Schema::table('lease_payment_reminders', function (Blueprint $table) {
            $table->dropColumn('subject');
        });
    }
};
