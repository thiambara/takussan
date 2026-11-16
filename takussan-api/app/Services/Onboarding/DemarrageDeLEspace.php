<?php

namespace App\Services\Onboarding;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\PropertyStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Agency\AgencySetupStatus;
use App\Services\Kyc\PiecesDuProfil;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-2479 (ADR-0089 §5) — les étapes du groupe « Démarrer » du menu de `/app`, pour le PROFIL ACTIF.
 *
 * Les codes, que le front libelle et relie (`takussan-web/src/lib/navigation/demarrer.ts`, qui ignore un code qu'il ne
 * connaît pas) : `premier_bien`, `kyc` (l'agence seule), `equipe`, et `piece:<code>` (TCK-2944). Aucune règle n'est réécrite ici :
 *
 *  - L'espace d'une AGENCE — le profil d'admin, ou le profil bailleur de l'hôte (agence `individual`
 *    dont le compte est aussi l'admin, TCK-497) — reprend trois des sept étapes de la mise en service
 *    ({@see AgencySetupStatus}, TCK-589) sous la même autorisation que sa carte
 *    (`AgencyPolicy::configure`, TCK-2024) : un admin à qui son rôle retire `agency.update` n'a pas
 *    plus d'étapes que de carte. Une agence `individual` n'a pas d'équipe : `equipe` n'y paraît pas
 *    (TCK-777, la règle de `MiseEnService.tsx`).
 *  - Le BAILLEUR : un bien à lui dans son agence, hors brouillon (la forme de
 *    `OwnerProfileController::properties`), puis ses pièces une à une.
 *  - TCK-2944 — le BAILLEUR, l'AGENT et le PRESTATAIRE : une étape `piece:<code>` par pièce REQUISE du
 *    profil, dans l'ordre et avec l'état de {@see PiecesDuProfil} (la liste de `/app/pieces`, `code`
 *    compris) ; `faite` quand la pièce est envoyée ou vérifiée, `etat` en français
 *    (`manquante` | `envoyee` | `verifiee` | `refusee`). Une pièce facultative (assurance RC pro du
 *    prestataire, NINEA du bailleur particulier) n'est pas une étape. Les anciennes étapes uniques
 *    `kyc` du bailleur et `pieces` (TCK-2612) disparaissent — et avec elles `metadata.kyc.submitted_at` :
 *    une soumission ne dit pas QUELLE pièce est partie, seul le `Document` vivant le dit.
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

    /** TCK-2944 — l'état d'une pièce ({@see PiecesDuProfil::ETATS}) → l'`etat` de son étape. */
    private const ETATS_DE_PIECE = [
        'missing' => 'manquante',
        'sent' => 'envoyee',
        'verified' => 'verifiee',
        'rejected' => 'refusee',
    ];

    public function __construct(
        private readonly AgencySetupStatus $miseEnService,
        private readonly PiecesDuProfil $pieces,
    ) {}

    /**
     * @return list<array{code: string, faite: bool, etat?: string}>
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

        // TCK-2612 — les pièces de l'agent et du prestataire quittent leurs assistants pour « Démarrer » ; TCK-2944 : une à une.
        if ($profilActif instanceof AgentProfile || $profilActif instanceof ServiceProviderProfile) {
            return $this->etapesDesPieces($profilActif);
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
     * @return list<array{code: string, faite: bool, etat?: string}>
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
            ...$this->etapesDesPieces($profil),
        ];
    }

    /**
     * TCK-2944 — une étape par pièce requise, dans l'ordre de {@see PiecesDuProfil} : même liste, même état que `/app/pieces`.
     *
     * @return list<array{code: string, faite: bool, etat: string}>
     */
    private function etapesDesPieces(Model $profil): array
    {
        $etapes = [];
        foreach ($this->pieces->pour($profil) as $piece) {
            if (! $piece['required']) {
                continue;
            }
            $etapes[] = [
                'code' => 'piece:'.$piece['code'],
                'faite' => in_array($piece['state'], ['sent', 'verified'], true),
                'etat' => self::ETATS_DE_PIECE[$piece['state']],
            ];
        }

        return $etapes;
    }
}
