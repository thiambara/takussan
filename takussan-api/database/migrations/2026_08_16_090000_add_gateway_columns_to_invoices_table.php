<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-285 / ardoise D-51 — la passerelle de paiement traitait déjà `Invoice` comme un
 * payable de plein droit PARTOUT sauf dans le schéma.
 *
 * `PaymentGatewayService` résout l'agence d'une facture (`paymentAgencyId`, ligne 445),
 * connaît son montant sous `total_amount` dans la garde de sous-paiement, et — surtout —
 * `paymentsForEvent()` interroge `Invoice::where('transaction_id', …)` pour rattacher un
 * webhook entrant. Seules les colonnes manquaient.
 *
 * ⚠️ Ce n'était pas une branche morte sans conséquence : c'était une panne TOTALE de la
 * passerelle en production.
 *
 *   `paymentsForEvent()` boucle sur [BookingPayment, LeasePayment, Invoice] et interroge
 *   chacun par `transaction_id`. La troisième requête lève `SQLSTATE[42S22] Unknown column`
 *   sur MySQL. Comme l'appelant enveloppe la boucle dans `DB::transaction()`, le paiement
 *   de réservation ou de loyer trouvé aux deux premiers tours est ANNULÉ par le rollback,
 *   et le webhook rend 500. Aucun paiement, d'aucun type, ne pouvait être confirmé.
 *
 * **Et la suite de tests ne pouvait structurellement pas le voir** : mesuré le 2026-08-16,
 * la même requête sur SQLite (le moteur des tests) ne lève pas — elle rend 0 ligne EN
 * SILENCE. Sur MySQL 8.0.46 (le moteur de production, mesuré) elle lève. C'était la règle n°4
 * du `CLAUDE.md` D'ALORS — « une migration se pense pour MySQL, jamais pour SQLite » —
 * transposée au REQUÊTAGE, où rien ne la gardait.
 * `tests/Feature/Api/PaymentGatewaySchemaContractTest.php` ferme ce trou.
 *
 * ⚠ Cette règle est RÉVOQUÉE depuis le 2026-08-21 (ADR-0020) : il n'y a plus qu'un moteur,
 * PostgreSQL 17, et la suite de tests tourne dessus. La divergence « tests permissifs,
 * production stricte » qui rendait ce défaut invisible **n'existe plus** — ce que la suite
 * éprouve est ce que la production exécutera. Le test de contrat reste utile pour autant :
 * il éprouve le SCHÉMA, pas le moteur, et une colonne oubliée reste une colonne oubliée.
 *
 * Colonnes calquées sur `booking_payments` et `lease_payments`, qui portent exactement les
 * mêmes depuis l'origine (`create_booking_payments_table.php:20,26`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table): void {
            // `string` nullable comme sur les deux autres payables : l'identifiant vient du
            // fournisseur, sa forme lui appartient, et il est nul tant qu'aucun paiement en
            // ligne n'a été amorcé.
            $table->string('transaction_id')->nullable()->after('currency');

            // Alimentée par `PaymentGatewayService::recordInitiation()`, qui ne l'écrit que
            // si le modèle la déclare `fillable` — d'où son ajout au `$fillable` d'`Invoice`
            // dans le même commit. Sans elle, l'historique consolidé ne sait pas par quel
            // canal la facture a été réglée.
            $table->string('payment_method')->nullable()->after('transaction_id');

            // `paymentsForEvent()` interroge cette colonne à CHAQUE webhook entrant, pour
            // les trois types de payables. Sans index, c'est un balayage complet de la table
            // des factures à chaque notification de paiement.
            //
            // Nom explicite : `invoices_transaction_id_index` fait 29 caractères et tiendrait
            // sous la limite de 63 de PostgreSQL, mais ce dépôt nomme ses index (piège n°3 du
            // CLAUDE.md) plutôt que de compter à chaque fois — d'autant que PostgreSQL ne
            // refuse pas un nom trop long, il le TRONQUE avec un simple `NOTICE`.
            $table->index('transaction_id', 'invoices_transaction_id_idx');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table): void {
            // L'index D'ABORD, la colonne ensuite. C'était une NÉCESSITÉ sous MySQL, qui
            // refuse de retirer une colonne encore indexée ; PostgreSQL, lui, supprime les
            // index dépendants avec la colonne. L'ordre est donc conservé parce qu'il est
            // juste partout, pas parce qu'il est encore requis — on ne réécrit pas un `down()`
            // déjà joué pour lui retirer une précaution qui ne coûte rien.
            //
            // Ce `down()` est exécuté par le job CI `migrations-pgsql` (ex-`migrations-mysql`),
            // cette migration se plaçant au-dessus de la borne TCK-278.
            $table->dropIndex('invoices_transaction_id_idx');
            $table->dropColumn(['transaction_id', 'payment_method']);
        });
    }
};
