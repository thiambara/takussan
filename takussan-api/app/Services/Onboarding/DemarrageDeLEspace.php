<?php

namespace App\Services\Onboarding;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\PropertyStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Agency\AgencySetupStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-2479 (ADR-0089 §5) — les étapes du groupe « Démarrer » du menu de `/app`, pour le PROFIL ACTIF.
 *
 * Trois codes, que le front libelle et relie (`takussan-web/src/lib/navigation/demarrer.ts`) :
 * `premier_bien`, `kyc`, `equipe`. Aucune règle n'est réécrite ici :
 *
 *  - L'espace d'une AGENCE — le profil d'admin, ou le profil bailleur de l'hôte (agence `individual`
 *    dont le compte est aussi l'admin, TCK-497) — reprend trois des sept étapes de la mise en service
 *    ({@see AgencySetupStatus}, TCK-589) sous la même autorisation que sa carte
 *    (`AgencyPolicy::configure`, TCK-2024) : un admin à qui son rôle retire `agency.update` n'a pas
 *    plus d'étapes que de carte. Une agence `individual` n'a pas d'équipe : `equipe` n'y paraît pas
 *    (TCK-777, la règle de `MiseEnService.tsx`).
 *  - Le BAILLEUR : un bien à lui dans son agence, hors brouillon (la forme de
 *    `OwnerProfileController::properties`), et ses pièces ENVOYÉES — `metadata.kyc.submitted_at` :
 *    aucune file ne les vérifie (TCK-685).
 *  - Tout autre profil, ou aucun : `[]`. Le groupe ne s'affiche pas ; ce n'est pas une erreur.
 *
 * C'est de l'AFFICHAGE : chaque écran que vise une étape rejuge (cf. `MeCapabilityController`).
 */
class DemarrageDeLEspace
{
    /** Le code du menu → l'étape de mise en service qu'il reprend. L'ordre est celui du groupe. */
    private const ETAPES_D_AGENCE = [
        'premier_bien' => 'first_published_property',
        'kyc' => 'kyc_verified',
        'equipe' => 'first_member',
    ];

    public function __construct(private readonly AgencySetupStatus $miseEnService) {}

    /**
     * @return list<array{code: string, faite: bool}>
     */
    public function pour(User $user, ?Model $profilActif): array
    {
        if ($profilActif instanceof AgencyAdminProfile || $this->estLeBailleurDeLHote($profilActif)) {
            $agence = $profilActif->agency;

            return $agence !== null && $user->can('configure', $agence) ? $this->etapesDeLAgence($agence) : [];
        }

        if ($profilActif instanceof OwnerProfile) {
            return $this->etapesDuBailleur($profilActif);
        }

        return [];
    }

    /**
     * Le profil bailleur d'une agence `individual` dont le compte est aussi l'admin : une seule
     * personne, un seul espace (`resoudrePersona` côté front en fait le persona `hote`).
     */
    private function estLeBailleurDeLHote(?Model $profil): bool
    {
        return $profil instanceof OwnerProfile
            && $profil->agency?->kind === AgencyKind::Individual
            && $profil->user?->isAgencyAdminAt((int) $profil->agency_id) === true;
    }

    /**
     * @return list<array{code: string, faite: bool}>
     */
    private function etapesDeLAgence(Agency $agence): array
    {
        $faites = array_column($this->miseEnService->for($agence)['steps'], 'done', 'key');

        $etapes = [];
        foreach (self::ETAPES_D_AGENCE as $code => $cle) {
            if ($code === 'equipe' && $agence->kind === AgencyKind::Individual) {
                continue;
            }
            $etapes[] = ['code' => $code, 'faite' => (bool) $faites[$cle]];
        }

        return $etapes;
    }

    /**
     * @return list<array{code: string, faite: bool}>
     */
    private function etapesDuBailleur(OwnerProfile $profil): array
    {
        $premierBien = $profil->user_id !== null && Property::query()
            ->where('user_id', $profil->user_id)
            ->when($profil->agency_id !== null, fn (Builder $q) => $q->where('agency_id', $profil->agency_id))
            ->where('status', '!=', PropertyStatus::Draft->value)
            ->exists();

        return [
            ['code' => 'premier_bien', 'faite' => $premierBien],
            ['code' => 'kyc', 'faite' => filled(data_get($profil->metadata, 'kyc.submitted_at'))],
        ];
    }
}
