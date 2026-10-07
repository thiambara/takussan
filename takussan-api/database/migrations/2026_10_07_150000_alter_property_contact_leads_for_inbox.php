<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-590 — les pistes de contact deviennent une boîte de réception.
 *
 *   · `name`, `email`, `message` deviennent nullables : un visiteur se joint par téléphone OU par
 *     e-mail, et un clic WhatsApp / Appeler (`channel`) n'a aucune identité. L'invariant est
 *     applicatif (`ContactLeadService`) : un lead `form` a un nom, un message, et un téléphone ou
 *     un e-mail.
 *   · `channel`, `source`, `medium`, `locale` : par où, d'où, et dans quelle langue répondre.
 *   · `handled_by_id`, `customer_id` : qui l'a traitée, et la fiche client née de sa conversion.
 *   · `agency_id` est RATTRAPÉ depuis le bien : les pistes de bien ne le portaient pas, et c'est
 *     la colonne par laquelle l'agence lit sa boîte (principe n°2).
 *
 * ⚠️ `DROP NOT NULL` en SQL brut, pour la raison de `2026_08_27_120000` : `->change()` réécrit la
 * colonne et emporte ce qu'on oublie d'y répéter.
 *
 * ⚠️ Index et clés nommés explicitement : PostgreSQL TRONQUE un nom auto-généré au-delà de 63
 * caractères, et un `dropIndex()` futur ne le retrouverait plus (piège n°3).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE property_contact_leads ALTER COLUMN name DROP NOT NULL');
        DB::statement('ALTER TABLE property_contact_leads ALTER COLUMN email DROP NOT NULL');
        DB::statement('ALTER TABLE property_contact_leads ALTER COLUMN message DROP NOT NULL');

        Schema::table('property_contact_leads', function (Blueprint $table) {
            $table->string('channel', 16)->default('form')->after('recipient_user_id');
            $table->string('source', 40)->nullable()->after('channel');
            $table->string('medium', 40)->nullable()->after('source');
            $table->string('locale', 5)->nullable()->after('medium');
            $table->foreignId('handled_by_id')->nullable()->after('handled_at')
                ->constrained('users', 'id', 'pcl_handled_by_fk')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->after('handled_by_id')
                ->constrained('customers', 'id', 'pcl_customer_fk')->nullOnDelete();

            $table->index(['agency_id', 'handled_at'], 'pcl_agency_handled_idx');
            $table->index('handled_by_id', 'pcl_handled_by_idx');
            $table->index('customer_id', 'pcl_customer_idx');
        });

        // Rattrapage : une piste de bien prend l'agence de son bien. Un bien sans agence laisse
        // `agency_id` nul — sa boîte est celle du destinataire.
        DB::statement(
            'UPDATE property_contact_leads AS l SET agency_id = p.agency_id '
            .'FROM properties AS p WHERE l.property_id = p.id AND l.agency_id IS NULL AND p.agency_id IS NOT NULL'
        );
    }

    /**
     * ⚠️ DESTRUCTEUR, et il ne peut pas ne pas l'être : rétablir `NOT NULL` échouerait sur la
     * première piste sans e-mail, ou sur le premier clic. Ces lignes sont supprimées avant — c'est
     * le prix d'un retour arrière, et il vaut mieux qu'un `down()` qui échoue le jour où on en a
     * besoin. Le rattrapage d'`agency_id` n'est pas défait : la colonne existait déjà, et la valeur
     * rattrapée est juste.
     */
    public function down(): void
    {
        DB::table('property_contact_leads')
            ->where(fn ($q) => $q->whereIn('channel', ['whatsapp', 'call'])
                ->orWhereNull('email')
                ->orWhereNull('name')
                ->orWhereNull('message'))
            ->delete();

        Schema::table('property_contact_leads', function (Blueprint $table) {
            $table->dropIndex('pcl_customer_idx');
            $table->dropIndex('pcl_handled_by_idx');
            $table->dropIndex('pcl_agency_handled_idx');
            $table->dropForeign('pcl_customer_fk');
            $table->dropForeign('pcl_handled_by_fk');
            $table->dropColumn(['channel', 'source', 'medium', 'locale', 'handled_by_id', 'customer_id']);
        });

        DB::statement('ALTER TABLE property_contact_leads ALTER COLUMN name SET NOT NULL');
        DB::statement('ALTER TABLE property_contact_leads ALTER COLUMN email SET NOT NULL');
        DB::statement('ALTER TABLE property_contact_leads ALTER COLUMN message SET NOT NULL');
    }
};
