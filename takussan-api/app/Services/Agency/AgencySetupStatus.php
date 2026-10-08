<?php

namespace App\Services\Agency;

use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\Enums\PaymentProvider;
use App\Models\Integration;
use App\Models\KycDossier;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * TCK-589 §7 — la « mise en service » d'une agence : sept étapes, chacune lue sur
 * l'état réel de la base, jamais sur un drapeau que l'onboarding aurait posé.
 *
 * L'ordre et les clés sont le contrat que lit la carte de `/admin` : le front
 * n'invente aucune étape, il libelle celles-ci.
 *
 *  - `kyc_verified` : le dossier KYC de l'agence est `verified` — lu SANS
 *    `dossierForAgency`, qui crée le dossier : une lecture n'écrit rien.
 *  - `payment_integration` : une intégration ACTIVE de Wave ou d'Orange Money —
 *    un connecteur Twilio n'encaisse rien (`lemon_squeezy` est la facturation de
 *    la plateforme, pas un moyen d'encaisser pour l'agence).
 *  - `first_member` : une deuxième personne active dans l'agence. Compté en
 *    personnes et non en profils : le fondateur porte souvent un profil d'agent
 *    ET un profil d'admin.
 *  - `first_published_property` : un bien de l'agence que le public voit,
 *    {@see Property::scopePublic()} composé et non recopié.
 *  - `admin_two_factor` : TOUS les admins actifs ont la 2FA — un seul suffit à
 *    ouvrir l'argent de l'agence (ADR-0033, contrainte 7).
 */
class AgencySetupStatus
{
    public const STEPS = [
        'kyc_verified',
        'logo',
        'commission_rate',
        'payment_integration',
        'first_member',
        'first_published_property',
        'admin_two_factor',
    ];

    /**
     * @return array{complete: bool, steps: list<array{key: string, done: bool}>}
     */
    public function for(Agency $agency): array
    {
        $steps = array_map(
            fn (string $key): array => ['key' => $key, 'done' => $this->isDone($key, $agency)],
            self::STEPS,
        );

        return [
            'complete' => ! in_array(false, array_column($steps, 'done'), true),
            'steps' => $steps,
        ];
    }

    private function isDone(string $key, Agency $agency): bool
    {
        return match ($key) {
            'kyc_verified' => KycDossier::query()
                ->where('subject_type', Agency::class)
                ->where('subject_id', $agency->id)
                ->where('status', KycDossierStatus::Verified)
                ->exists(),
            'logo' => $agency->hasMedia('logo'),
            'commission_rate' => $agency->commission_rate !== null,
            'payment_integration' => Integration::query()
                ->where('agency_id', $agency->id)
                ->where('is_active', true)
                ->whereIn('provider', [PaymentProvider::Wave->value, PaymentProvider::OrangeMoney->value])
                ->exists(),
            'first_member' => $this->memberIds($agency)->count() >= 2,
            'first_published_property' => Property::query()
                ->where('agency_id', $agency->id)
                ->public()
                ->exists(),
            'admin_two_factor' => $this->adminsHaveTwoFactor($agency),
        };
    }

    /** @return Collection<int, int> */
    private function memberIds(Agency $agency): Collection
    {
        return AgentProfile::query()
            ->where('agency_id', $agency->id)
            ->where('status', AgentProfileStatus::Active)
            ->pluck('user_id')
            ->merge($this->adminIds($agency))
            ->unique()
            ->values();
    }

    /** @return Collection<int, int> */
    private function adminIds(Agency $agency): Collection
    {
        return AgencyAdminProfile::query()
            ->where('agency_id', $agency->id)
            ->where('status', AgencyAdminProfileStatus::Active)
            ->pluck('user_id')
            ->when($agency->primary_admin_id !== null, fn ($ids) => $ids->push($agency->primary_admin_id))
            ->unique()
            ->values();
    }

    private function adminsHaveTwoFactor(Agency $agency): bool
    {
        $adminIds = $this->adminIds($agency);

        // Compté sur `true` : une colonne nulle n'est pas une 2FA.
        return $adminIds->isNotEmpty()
            && User::query()->whereIn('id', $adminIds)->where('two_factor_enabled', true)->count() === $adminIds->count();
    }
}
