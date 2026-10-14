<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-640 — une intégration (fournisseur, agence) est unique parmi les lignes VIVANTES, intégration
 * de plateforme (`agency_id` nul) comprise.
 *
 * `integrations_provider_agency_id_unique` avait deux défauts :
 *
 * 1. **Il ne protégeait pas l'intégration de plateforme.** Sans `NULLS NOT DISTINCT`, deux lignes
 *    `(wave, NULL)` passaient — `IntegrationController::store` les acceptait d'un super-admin sans
 *    agence — et `PaymentGatewayService::resolveIntegration()` en prenait une par `first()` sans
 *    ordre : les identifiants de paiement servis n'étaient pas déterminés.
 * 2. **Il comptait les lignes supprimées.** `Integration` est en `SoftDeletes` : une intégration
 *    supprimée interdisait à jamais d'en recréer une pour le même couple (`23505`, rendu 500). Même
 *    défaut, même correctif que `sp_agency_collab_unique` (TCK-592).
 *
 * Doublons vivants existants : l'intégration active l'emporte, puis la plus récemment écrite ; les
 * autres sont SUPPRIMÉES EN DOUCEUR, jamais effacées — elles portent des identifiants chiffrés et
 * des journaux de webhook (`integration_webhook_logs`) qui les citent.
 *
 * Laravel n'exprime pas un index partiel : SQL brut, PostgreSQL (ADR-0020).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            UPDATE integrations SET deleted_at = now(), updated_at = now() WHERE id IN (
                SELECT id FROM (
                    SELECT id, row_number() OVER (
                        PARTITION BY provider, agency_id ORDER BY is_active DESC, updated_at DESC NULLS LAST, id DESC
                    ) AS rang
                    FROM integrations
                    WHERE deleted_at IS NULL
                ) classees
                WHERE rang > 1
            )
            SQL);

        DB::statement('ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_provider_agency_id_unique');
        DB::statement('DROP INDEX IF EXISTS integrations_provider_agency_id_unique');
        DB::statement(
            'CREATE UNIQUE INDEX integrations_provider_agency_live_unique ON integrations '
            .'(provider, agency_id) NULLS NOT DISTINCT WHERE deleted_at IS NULL'
        );
    }

    /**
     * Restaure l'unicité d'origine. ⚠ Échoue si une intégration supprimée et une vivante partagent
     * le même couple : c'est précisément l'état que `up()` rend possible, et le restaurer en silence
     * supposerait de choisir laquelle effacer.
     */
    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS integrations_provider_agency_live_unique');
        DB::statement(
            'ALTER TABLE integrations ADD CONSTRAINT integrations_provider_agency_id_unique '
            .'UNIQUE (provider, agency_id)'
        );
    }
};
