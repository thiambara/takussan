<?php

namespace App\Observers;

use App\Models\Agency;
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
}
