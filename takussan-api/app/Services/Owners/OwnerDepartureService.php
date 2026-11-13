<?php

namespace App\Services\Owners;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Payout\PayoutClawbacks;
use App\Services\Profiles\ActiveProfileResolver;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;

/**
 * TCK-2753 (ADR-0108) — le départ d'un bailleur : `DELETE /api/owners/{ownerProfile}`.
 *
 * Refusé tant qu'il laisse un bien, un bail en cours ou de l'argent dû (422
 * `owner.departure_not_empty`, avec l'inventaire de {@see OwnerDeparture}) ; sinon son profil passe
 * `inactive`, et RIEN d'autre ne change en base que le journal : ni bien, ni bail, ni paiement, ni
 * reversement, ni relevé, ni document, ni fil. Le profil reste bénéficiaire (`BeneficiaireDuReversement`)
 * et lecteur de ce qui le désigne (`BailleurDuBien`) ; il n'écrit plus (`isBlockedOwnerAt`), et ne se
 * résout plus en profil actif (`ActiveProfileResolver::isActiveProfile` ne retient que `active`).
 *
 * **Le verrou** (piège n° 10 de `takussan-api/CLAUDE.md`) : ses biens de l'agence d'abord, par
 * identifiant croissant, puis la ligne du profil, relue ; l'inventaire se recompte ensuite. Sur le
 * chemin du succès il n'a, par construction, aucun bien : seule la ligne du profil est tenue. Le verrou
 * des biens sert le refus et ferme l'ordre bien → utilisateur pour un écrivain qui lui en rattacherait
 * un pendant le geste (`TitulaireALaSaisie::bailleurActif` exige un profil `active`, que la ligne
 * verrouillée tient jusqu'au commit).
 *
 * `departed_at` n'est pas une colonne : c'est la date de l'entrée `owner_departed` du journal, que seul
 * ce service écrit, dans la transaction qui pose `inactive` (ADR-0108 § 7).
 */
final class OwnerDepartureService
{
    public const EVENEMENT = 'owner_departed';

    public function __construct(
        private readonly OwnerDeparture $inventaire,
        private readonly PayoutClawbacks $clawbacks,
    ) {}

    public function depart(OwnerProfile $profile, User $actor): OwnerProfile
    {
        $this->assertForme($profile, $actor);

        return DB::transaction(function () use ($profile, $actor): OwnerProfile {
            Property::query()
                ->where('agency_id', $profile->agency_id)
                ->where('user_id', $profile->user_id)
                ->orderBy('id')
                ->lockForUpdate()
                ->get(['id']);
            /** @var OwnerProfile $locked */
            $locked = OwnerProfile::query()->whereKey($profile->getKey())->lockForUpdate()->firstOrFail();
            $this->assertForme($locked, $actor);

            $inventaire = $this->inventaire->inventory($locked);
            if (! OwnerDeparture::estVide($inventaire['blocking'])) {
                throw (new ApiError(422, 'owner.departure_not_empty'))->with(['blocking' => $inventaire['blocking']]);
            }

            $agencyId = (int) $locked->agency_id;
            $landlord = User::withTrashed()->findOrFail((int) $locked->user_id);
            $reprise = round((float) $this->clawbacks->outstanding($agencyId, (int) $landlord->id)->sum('remaining'), 2);
            $solde = (float) $inventaire['balance']['remaining_to_pay'];

            // L'audit du modèle (`OwnerProfile::AUDIT_ONLY`) écrit le changement de statut.
            $locked->forceFill(['status' => OwnerProfileStatus::Inactive])->save();

            $revoked = 0;
            if (! $this->gardeUnProfilActif($landlord)) {
                $revoked = $landlord->tokens()->delete();
            }

            activity('Membership')
                ->causedBy($actor)
                ->performedOn($locked)
                ->withProperties([
                    'agency_id' => $agencyId,
                    'owner_profile_id' => (int) $locked->id,
                    'user_id' => (int) $landlord->id,
                    'inventory' => $inventaire['blocking'],
                    // Ce que le bailleur doit à l'agence, qu'elle recouvre hors de la plateforme (§ 3) :
                    // le reliquat des reprises non imputées, et le trop-versé (le solde, négatif).
                    'outstanding_clawback' => $reprise > 0 ? $reprise : null,
                    'negative_balance' => $solde < 0 ? $solde : null,
                    'tokens_revoked' => $revoked,
                ])
                ->event(self::EVENEMENT)
                ->log(self::EVENEMENT);

            return $locked->refresh();
        });
    }

    /** La date du départ : celle de l'entrée `owner_departed` du profil, `null` s'il n'est pas parti. */
    public static function departedAt(OwnerProfile $profile): ?\DateTimeInterface
    {
        if ($profile->status !== OwnerProfileStatus::Inactive) {
            return null;
        }

        return Activity::query()
            ->where('event', self::EVENEMENT)
            ->where('subject_type', $profile->getMorphClass())
            ->where('subject_id', $profile->getKey())
            ->latest('id')
            ->value('created_at');
    }

    /** Les refus de forme seuls ({@see self::assertForme()}), pour la lecture avant le geste. */
    public function peutPartir(OwnerProfile $profile, User $actor): bool
    {
        try {
            $this->assertForme($profile, $actor);
        } catch (ApiError) {
            return false;
        }

        return true;
    }

    /**
     * Les refus de forme (ADR-0108 § 7), avant tout compte : un départ déjà fait, un brouillon
     * d'invitation (il se révoque), une agence `individual` (l'hôte y est administrateur et bailleur :
     * quitter sa propre agence est un autre geste), soi-même (un autre administrateur le fait).
     */
    private function assertForme(OwnerProfile $profile, User $actor): void
    {
        abort_code_if($profile->status === OwnerProfileStatus::Inactive, 422, 'owner.already_departed');
        abort_code_if($profile->status === OwnerProfileStatus::Draft || $profile->user_id === null, 422, 'owner.departure_draft');
        $agency = Agency::query()->find((int) $profile->agency_id);
        abort_code_if($agency?->kind === AgencyKind::Individual, 422, 'owner.departure_individual');
        abort_code_if((int) $profile->user_id === (int) $actor->id, 422, 'owner.departure_self');
    }

    /** Un jeton Sanctum ne porte pas de profil : il ne sert plus rien si aucun profil actif ne reste. */
    private function gardeUnProfilActif(User $landlord): bool
    {
        return $landlord->fresh()?->profiles()->contains(fn ($p) => ActiveProfileResolver::isActiveProfile($p)) ?? false;
    }
}
