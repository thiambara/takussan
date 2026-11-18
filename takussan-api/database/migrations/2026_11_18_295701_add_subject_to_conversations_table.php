<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2957 (ADR-0128 § 1) — un fil se rattache à SON objet par un lien générique.
 *
 *  - `subject_type` porte une CLÉ du registre fermé `App\Services\Messaging\SujetsDuFil`
 *    (`maintenance_request`, `lease`, `booking`), jamais un nom de classe ;
 *  - `subject_id` l'identifiant de l'objet. Pas de clé étrangère : un lien générique n'en a pas, et
 *    c'est l'observateur `FermeLeFilDeSonObjet` qui ferme le fil d'un objet supprimé.
 *
 * ⚠ `conversations.subject` existe déjà : c'est le TITRE du fil. Les trois clés existantes
 * (`property_id`, `lease_id`, `maintenance_request_id`) restent et gardent leur sens de contexte.
 *
 * Reprise, en SQL pur : tout fil qui porte `maintenance_request_id` reçoit le sujet de cette demande
 * (directes comprises : la reprise suit la colonne, pas le type ; fils supprimés compris). Les fils
 * neufs naissent avec leur sujet (`GroupConversationService::create(sujet: …)`).
 *
 * Index nommé explicitement (piège n° 3 : un nom tronqué à 63 caractères ne se retrouve plus).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->string('subject_type', 40)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->index(['subject_type', 'subject_id'], 'conversations_subject_idx');
        });

        DB::statement(<<<'SQL'
            UPDATE conversations
               SET subject_type = 'maintenance_request',
                   subject_id = maintenance_request_id
             WHERE maintenance_request_id IS NOT NULL
        SQL);
    }

    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropIndex('conversations_subject_idx');
            $table->dropColumn(['subject_type', 'subject_id']);
        });
    }
};
