<?php

namespace App\Observers;

use App\Jobs\Media\RegenerateAgencyWatermarksJob;
use App\Models\Agency;
use App\Services\Media\AgencyWatermarkContext;
use App\Services\Membership\AgencySystemRoleSeeder;

/**
 * TCK-279 — AC1 : à la création d'une agence, les 4 rôles système sont
 * seedés avec les capacités de la table de vérité phase 1.
 *
 * Synchrone et non en job : sans rôle système, la création du premier
 * profil de l'agence — qui suit immédiatement dans le wizard d'onboarding —
 * n'aurait aucun `agency_role_id` à prendre, et la colonne est NOT NULL.
 * Un job asynchrone rendrait cette fenêtre observable.
 */
class AgencyObserver
{
    public function __construct(
        private readonly AgencySystemRoleSeeder $seeder,
    ) {}

    public function created(Agency $agency): void
    {
        $this->seeder->seed($agency);
    }

    /**
     * TCK-539 (R1 de la seconde passe adverse) — ACTIVER le filigrane met en file la
     * régénération des photos de l'agence. Rien ne la lançait : `PUT /api/agencies/{id}` rendait
     * 200, et les photos produites sans filigrane restaient nues — servies au titre de leur
     * exemption (`WatermarkTrace`), ou cachées pour de bon si elles n'en avaient pas.
     *
     * Ici plutôt que dans `AgencyController::update()` : c'est le seul écrivain de `settings`
     * aujourd'hui (relevé : `grep` de `watermark_enabled` et des écritures d'`Agency`), mais un
     * second — tinker, une commande, un écran d'administration — passerait à côté.
     *
     * La transition se juge sur la règle EFFECTIVE (`isEnabledInSettings`) : une clé absente
     * vaut `true`, donc `false` → clé retirée est une activation, et `true` → clé retirée n'en
     * est pas une. `afterCommit` : le job ne doit pas lire les réglages avant qu'ils existent.
     *
     * ⚠ **Angle mort connu (R1c, latent)** : une écriture de MASSE —
     * `Agency::query()->update(['settings' => …])`, `DB::table('agencies')->update(…)` — ne
     * passe par aucun événement de modèle, donc pas par ici : l'agence exige le filigrane et
     * ses photos exemptées restent servies nues, sans régénération. Aucun appel de ce genre
     * n'existe dans `app/` (relevé 2026-09-21). En écrire un, c'est lancer soi-même
     * `RegenerateAgencyWatermarksJob` pour chaque agence activée (TCK-547, « Restes connus »).
     */
    public function updated(Agency $agency): void
    {
        if (! $agency->wasChanged('settings')) {
            return;
        }

        $before = AgencyWatermarkContext::isEnabledInSettings($this->originalSettings($agency));
        $after = AgencyWatermarkContext::isEnabledInSettings($agency->settings);

        if (! $before && $after) {
            RegenerateAgencyWatermarksJob::dispatch($agency->id)->afterCommit();
        }
    }

    /** @return array<string, mixed>|null */
    private function originalSettings(Agency $agency): ?array
    {
        $original = $agency->getOriginal('settings');

        return is_string($original) ? json_decode($original, true) : $original;
    }
}
