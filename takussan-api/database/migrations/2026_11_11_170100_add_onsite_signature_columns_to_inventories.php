<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2646 (ADR-0098 §5) — la trace de la signature du locataire, en colonnes :
 *
 * - `tenant_signature_method` : `drawn` (le locataire depuis son compte) ou `onsite_otp` (sur
 *   l'appareil d'un membre du personnel, avec le code reçu par SMS). Les états des lieux déjà signés
 *   par le locataire l'ont tous été depuis son compte : ils reçoivent `drawn` ;
 * - `tenant_signed_via_user_id` : le membre du personnel qui tenait l'appareil ;
 * - `tenant_otp_channel` et `tenant_otp_destination` (le numéro MASQUÉ, comme
 *   `lease_signatures.otp_destination`) ;
 * - `tenant_signed_ip` : l'adresse de la requête, qui ne sort jamais de l'API (ADR-0042 §3) ;
 * - `entry_inventory_id` : pour une sortie, l'entrée signée dont elle reprend les pièces et les
 *   états d'entrée — relue à chaque écriture, jamais fournie par le client.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventories', function (Blueprint $table) {
            $table->string('tenant_signature_method', 20)->nullable()->after('tenant_signature_hash');
            $table->foreignId('tenant_signed_via_user_id')->nullable()->after('tenant_signature_method')
                ->constrained('users', 'id', 'inventories_tenant_signed_via_fk')->nullOnDelete();
            $table->string('tenant_otp_channel', 10)->nullable()->after('tenant_signed_via_user_id');
            $table->string('tenant_otp_destination', 120)->nullable()->after('tenant_otp_channel');
            $table->string('tenant_signed_ip', 45)->nullable()->after('tenant_otp_destination');
            $table->foreignId('entry_inventory_id')->nullable()->after('tenant_id')
                ->constrained('inventories', 'id', 'inventories_entry_inventory_fk')->nullOnDelete();
            $table->index('entry_inventory_id', 'inventories_entry_inventory_idx');
        });

        DB::table('inventories')->where('tenant_signed', true)->update(['tenant_signature_method' => 'drawn']);
    }

    public function down(): void
    {
        Schema::table('inventories', function (Blueprint $table) {
            $table->dropIndex('inventories_entry_inventory_idx');
            $table->dropForeign('inventories_entry_inventory_fk');
            $table->dropForeign('inventories_tenant_signed_via_fk');
            $table->dropColumn([
                'entry_inventory_id',
                'tenant_signed_ip',
                'tenant_otp_destination',
                'tenant_otp_channel',
                'tenant_signed_via_user_id',
                'tenant_signature_method',
            ]);
        });
    }
};
