<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-272 — `users.password_set_at` : la date à laquelle l'utilisateur a
 * CHOISI son mot de passe. NULL = le hash en base est une valeur machine
 * que personne ne connaît, donc `Hash::check` y échouera toujours.
 *
 * `users.password` reste NOT NULL : quatre chemins de création y écrivent
 * un hash et le rendre nullable serait un changement de contrat inutile.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE BACKFILL EST IMPARFAIT, ET VOICI EXACTEMENT EN QUOI
 * ─────────────────────────────────────────────────────────────────────────
 * Règle appliquée : `password_set_at = created_at` pour tout compte SANS
 * identifiant social ; NULL pour les comptes portant `google_id`,
 * `facebook_id` ou `apple_id`.
 *
 * CE QU'ELLE CLASSE BIEN :
 *  - inscription e-mail/mot de passe → mot de passe utilisable ✔
 *  - inscription OAuth pure (`bcrypt(Str::random(32))`) → NULL ✔
 *
 * CE QU'ELLE CLASSE MAL, ET POURQUOI ON NE PEUT PAS FAIRE MIEUX ICI :
 *  - Invitation acceptée SANS choisir de mot de passe
 *    (`InvitationService::acceptAsNewUser`, `bcrypt(Str::random(40))`) :
 *    classé « a un mot de passe » à tort. Ces comptes restent donc dans le
 *    cul-de-sac jusqu'à ce qu'ils passent par « mot de passe oublié ».
 *  - Admin d'agence provisionné (`AgencyProvisioningService`,
 *    `Hash::make(Str::password(32))`) : même erreur, même conséquence.
 *    Ces deux populations n'ont AUCUN marqueur en base qui les distingue
 *    d'une inscription classique — ni colonne, ni ligne conservée
 *    (`password_reset_tokens` est purgée à l'usage). Les classer à NULL
 *    par prudence ouvrirait la voie e-mail (plus faible) à tous les
 *    comptes ordinaires, ce que la décision produit interdit.
 *  - Compte OAuth ayant DEPUIS fait un « mot de passe oublié » : classé
 *    NULL à tort. Conséquence bénigne et non bloquante — il se voit
 *    proposer le code e-mail au lieu de son mot de passe, et son
 *    `password_set_at` sera posé au prochain reset.
 *
 * Le code neuf, lui, est exact : les six sites d'écriture d'un mot de
 * passe sont instrumentés à partir de ce ticket.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('password_set_at')->nullable()->after('password');
        });

        // Backfill — cf. l'en-tête pour ce que cette règle classe mal.
        DB::table('users')
            ->whereNull('google_id')
            ->whereNull('facebook_id')
            ->whereNull('apple_id')
            ->update(['password_set_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('password_set_at');
        });
    }
};
