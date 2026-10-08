<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-596 §5 — l'état des lieux dit QUI a signé pour le bailleur, et pour le compte de qui, et fige
 * son empreinte à la seconde signature.
 *
 * - `traceability_hash` : SHA-256 complet, figé une fois. Il couvre aussi les photos par pièce.
 *   Nul pour un état des lieux signé avant ce ticket : le PDF garde alors l'empreinte qu'il
 *   imprimait (on ne change pas l'empreinte d'un document déjà remis).
 * - `owner_signed_by_user_id` / `owner_signed_on_behalf_of_user_id` : `owner_signed` n'était qu'un
 *   booléen. `on_behalf_of` est renseigné quand un membre du personnel signe au titre du mandat.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventories', function (Blueprint $table) {
            $table->string('traceability_hash', 64)->nullable()->after('signed_at');
            $table->foreignId('owner_signed_by_user_id')->nullable()->after('owner_signature_hash')
                ->constrained('users', 'id', 'inventories_owner_signed_by_fk')->nullOnDelete();
            $table->foreignId('owner_signed_on_behalf_of_user_id')->nullable()->after('owner_signed_by_user_id')
                ->constrained('users', 'id', 'inventories_owner_on_behalf_fk')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('inventories', function (Blueprint $table) {
            $table->dropForeign('inventories_owner_on_behalf_fk');
            $table->dropForeign('inventories_owner_signed_by_fk');
            $table->dropColumn(['owner_signed_on_behalf_of_user_id', 'owner_signed_by_user_id', 'traceability_hash']);
        });
    }
};
