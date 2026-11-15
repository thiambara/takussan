<?php

namespace App\Services\Search;

use App\Http\Controllers\Public\PublicAgencyController;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Services\Public\AgentPublic;

/**
 * TCK-2517 — ce que les filtres `agency` et `agent` de la liste publique désignent : le profil dont la fiche publique
 * existe sous ce slug, ou rien. « Rien » ne lève jamais : la liste rend alors zéro bien, comme pour un slug inexistant —
 * aucune information sur l'existence d'un compte ou d'une agence hors ligne.
 *
 * Les prédicats sont ceux des fiches, pour que la liste filtrée et le portefeuille d'une fiche désignent le même profil :
 *
 * - **agence** : `slug`, statut `active`, type `standard` — {@see PublicAgencyController::properties()} ;
 * - **agent** : la résolution MÊME de la fiche, {@see AgentPublic::parSlug()} — slug au nom, ancien slug au nom, puis
 *   `username` (TCK-2519) ; compte `active`, fiche publique, aucune agence hors ligne (TCK-600). Partagée, et non
 *   recopiée : une adresse qui sert la fiche filtre la liste, une adresse qui rend 404 la vide.
 */
final class ProfilDuFiltre
{
    public function agence(string $slug): ?int
    {
        $id = Agency::query()
            ->where('slug', $slug)
            ->where('status', AgencyStatus::Active)
            ->where('kind', AgencyKind::Standard)
            ->value('id');

        return $id === null ? null : (int) $id;
    }

    public function agent(string $slug): ?int
    {
        $agent = app(AgentPublic::class)->parSlug($slug);

        return $agent === null ? null : (int) $agent->id;
    }
}
