<?php

namespace App\Services\Onboarding;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\Currency;
use App\Models\GeoCity;
use App\Models\KycDossier;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Kyc\KycWorkflowService;
use App\Services\Kyc\SharedLegalIdentifierDetector;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * TCK-2937 (ADR-0125) — « Créer mon espace pro » : l'agence `standard` s'ouvre tout de suite, et se
 * vérifie ensuite.
 *
 * Une transaction :
 *   1. la ligne du compte verrouillée (deux clics ne font pas deux agences) ;
 *   2. 409 `agency.already_admin` si l'appelant est déjà `primary_admin_id` d'une agence ou tient un
 *      `AgencyAdminProfile` actif — un espace individuel garde son chemin, le passage en pro ;
 *   3. 422 `agency.phone_unverified` sans numéro vérifié sur le compte ; 422 `agency.ninea_taken`
 *      si le NINEA saisi est déjà porté par une autre agence revue par la plateforme (§ 3) ;
 *   4. l'agence `standard`, `active`, non vérifiée, `self_opened_at` posée (§ 6), l'appelant en
 *      `primary_admin_id` ; la ville principale en adresse « Siège » ;
 *   5. son `AgencyAdminProfile` actif et son `AgentProfile`, comme l'admin de la console
 *      (`AgencyProvisioningService`) ; aucun `OwnerProfile`, aucun espace individuel ;
 *   6. le dossier de vérification, ouvert (`pending`) par {@see KycWorkflowService::dossierForAgency()}.
 *
 * `SpaceCreated` n'est PAS déclenché : pas de crédits de bienvenue avant la vérification (§ 5,
 * TCK-2311 P225.06).
 */
class OwnAgencyOpeningService
{
    public function __construct(private readonly KycWorkflowService $kyc) {}

    /**
     * @param  array{name: string, geo_city_id?: int|null, phone?: string|null, ninea?: string|null}  $data
     * @return array{agency: Agency, agency_admin_profile: AgencyAdminProfile, kyc_dossier: KycDossier}
     */
    public function open(User $user, array $data): array
    {
        return DB::transaction(function () use ($user, $data): array {
            User::query()->whereKey($user->getKey())->lockForUpdate()->firstOrFail();

            abort_code_if($this->alreadyAdmin($user), 409, 'agency.already_admin');
            // ADR-0125 § 2 — un numéro vérifié : l'agence non revue envoie des invitations sous son
            // nom, il faut qu'on sache qui la tient. Même exigence que l'espace individuel (OTP).
            abort_code_if($user->phone_verified_at === null, 422, 'agency.phone_unverified');

            $ninea = SharedLegalIdentifierDetector::normalize($data['ninea'] ?? null);
            abort_code_if(
                $ninea !== null && (new SharedLegalIdentifierDetector)->nineaHolders($ninea) !== [],
                422,
                'agency.ninea_taken',
            );

            $name = trim((string) $data['name']);
            $agency = Agency::query()->create([
                'name' => $name,
                'slug' => $this->uniqueSlug($name),
                'kind' => AgencyKind::Standard,
                'status' => AgencyStatus::Active,
                'is_verified' => false,
                'verified_at' => null,
                'currency' => Currency::default(),
                'phone' => $data['phone'] ?? $user->phone,
                'ninea' => $data['ninea'] ?? null,
                'primary_admin_id' => $user->id,
            ]);
            $agency->forceFill(['self_opened_at' => now()])->save();

            $this->createHeadOffice($agency, $data['geo_city_id'] ?? null);

            $adminProfile = AgencyAdminProfile::query()->create([
                'user_id' => $user->id,
                'agency_id' => $agency->id,
                'status' => AgencyAdminProfileStatus::Active->value,
            ]);
            AgentProfile::query()->firstOrCreate(['user_id' => $user->id, 'agency_id' => $agency->id]);

            $dossier = $this->kyc->dossierForAgency($agency);

            activity('Onboarding')
                ->causedBy($user)
                ->performedOn($agency)
                ->withProperties([
                    'user_id' => $user->id,
                    'agency_id' => $agency->id,
                    'kyc_dossier_id' => $dossier->id,
                    'source' => 'orientation',
                ])
                ->event('agency_self_opened')
                ->log('agency_self_opened');

            return [
                'agency' => $agency->refresh(),
                'agency_admin_profile' => $adminProfile->refresh(),
                'kyc_dossier' => $dossier,
            ];
        });
    }

    private function alreadyAdmin(User $user): bool
    {
        return Agency::query()->where('primary_admin_id', $user->id)->exists()
            || AgencyAdminProfile::query()
                ->where('user_id', $user->id)
                ->where('status', AgencyAdminProfileStatus::Active->value)
                ->exists();
    }

    private function createHeadOffice(Agency $agency, ?int $geoCityId): void
    {
        $ville = $geoCityId !== null ? GeoCity::query()->find($geoCityId) : null;
        if ($ville === null) {
            return;
        }

        Address::query()->create([
            'addressable_id' => $agency->id,
            'addressable_type' => Agency::class,
            'label' => 'Siège',
            'city' => $ville->name,
            'geo_city_id' => $ville->id,
            'country' => 'SN',
        ]);
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name);
        if ($base === '') {
            $base = 'agence';
        }

        $slug = $base;
        $suffix = 2;
        // `agencies.slug` est unique sur toutes les lignes, supprimées comprises (TCK-1133).
        while (Agency::withTrashed()->where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
