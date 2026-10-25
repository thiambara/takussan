<?php

namespace App\Services\Property;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Model\NotificationService;

/**
 * TCK-997 (P15.06, P50.01, P50.03 ; ADR-0036, amendement du 2026-10-19) — le titulaire d'un bien
 * (`properties.user_id`) se fixe à sa CRÉATION : la saisie, le lot et la copie. Ce service ne
 * l'écrit jamais après coup : le transfert (« changer le titulaire », TCK-999, et l'acceptation
 * d'une invitation, TCK-1000) est {@see PropertyOwnerTransfer}, qui lit ici la même règle du
 * bailleur désignable ({@see self::bailleurActif()}) et le même avis ({@see self::prevenir()}).
 *
 * À la saisie (`PropertyController::store`) :
 *  - `owner_id` envoyé : un bailleur ACTIF de l'agence du bien, jamais du personnel ; refusé pour
 *    une proposition (un bailleur ne désigne que lui-même, ADR-0031 § 2), pour une agence
 *    `individual` (le titulaire y est le créateur, TCK-284) et pour un bien sans agence ;
 *  - sinon, le titulaire du parent quand c'est un bailleur de l'agence (le lot naît au nom du
 *    bailleur de l'immeuble, Q3) ;
 *  - sinon, l'auteur : l'agence garde le bien en propre (Q1).
 *
 * Le titulaire d'un parent tenu par un bailleur est le seul admis pour son lot (Q4) : un autre
 * `owner_id` rend 422, comme le rattachement par `PUT` d'un lot d'un autre titulaire.
 *
 * TCK-1000 (Q2, voie 2) — `pending_owner_profile_id` lie le bien au profil `draft` d'un bailleur
 * INVITÉ ({@see self::bailleurEnAttente()}) ; le bien naît au nom de l'auteur et passe au bailleur à
 * l'acceptation de l'invitation, par {@see PropertyOwnerTransfer}.
 */
final class TitulaireALaSaisie
{
    /**
     * L'identifiant du titulaire du bien à créer. Lève 422 `property.owner_designation_forbidden`,
     * `property.owner_not_in_agency` ou `property.parent_owner_mismatch`.
     */
    public function resoudre(User $auteur, ?int $agencyId, mixed $ownerId, ?Property $parent, bool $proposition): int
    {
        $titulaireDuParent = $parent !== null && self::tenuParUnBailleur($parent) ? (int) $parent->user_id : null;

        if ($ownerId === null) {
            return $titulaireDuParent ?? (int) $auteur->id;
        }

        $agency = $agencyId !== null ? Agency::query()->find($agencyId) : null;
        abort_code_if(
            $proposition || $agency === null || $agency->kind?->isIndividual(),
            422,
            'property.owner_designation_forbidden',
        );

        $ownerId = (int) $ownerId;
        abort_code_unless($this->bailleurActif($ownerId, (int) $agency->id), 422, 'property.owner_not_in_agency');
        abort_code_if($titulaireDuParent !== null && $titulaireDuParent !== $ownerId, 422, 'property.parent_owner_mismatch');

        return $ownerId;
    }

    /**
     * TCK-1000 (Q2) — le profil du bailleur invité auquel lier le bien à créer, ou `null`. Mêmes
     * refus que `owner_id` pour la proposition, l'agence `individual` et le bien sans agence ; le
     * profil est un `OwnerProfile` `draft` de l'agence du bien, sans compte, dont une invitation
     * est `sent` et non échue (`property.pending_owner_not_invited`). Un lot sous le bien d'un
     * bailleur naît au nom de ce bailleur : il ne se lie à aucun autre (`parent_owner_mismatch`).
     */
    public function bailleurEnAttente(?int $agencyId, mixed $profileId, ?Property $parent, bool $proposition): ?int
    {
        if ($profileId === null) {
            return null;
        }

        $agency = $agencyId !== null ? Agency::query()->find($agencyId) : null;
        abort_code_if(
            $proposition || $agency === null || $agency->kind?->isIndividual(),
            422,
            'property.owner_designation_forbidden',
        );

        $profileId = (int) $profileId;
        $invite = OwnerProfile::query()
            ->whereKey($profileId)
            ->where('agency_id', $agency->id)
            ->where('status', OwnerProfileStatus::Draft->value)
            ->whereNull('user_id')
            ->exists()
            && Invitation::query()
                ->where('agency_id', $agency->id)
                ->where('invitable_type', OwnerProfile::class)
                ->where('invitable_id', $profileId)
                ->pending()
                ->exists();
        abort_code_unless($invite, 422, 'property.pending_owner_not_invited');
        abort_code_if($parent !== null && self::tenuParUnBailleur($parent), 422, 'property.parent_owner_mismatch');

        return $profileId;
    }

    /**
     * TCK-1000 (Q2) — l'invitation du bailleur est close (acceptée, révoquée, expirée) : les biens
     * liés à son profil perdent le lien, et rien d'autre ne change. Par requête, sans journal du
     * modèle : la ligne de l'invitation (`invitation_revoked`, `invitation_expired`) en dit la raison.
     *
     * @param  iterable<int>  $profileIds
     */
    public static function delier(iterable $profileIds): void
    {
        $ids = collect($profileIds)->map(fn ($id) => (int) $id)->unique()->values()->all();
        if ($ids === []) {
            return;
        }

        Property::withTrashed()->whereIn('pending_owner_profile_id', $ids)->toBase()
            ->update(['pending_owner_profile_id' => null]);
    }

    /**
     * La copie prend le titulaire de la source quand c'est un bailleur de l'agence de la source ;
     * sinon l'acteur, comme avant (TCK-074).
     */
    public function titulaireDeLaCopie(Property $source, User $acteur): int
    {
        return self::tenuParUnBailleur($source) ? (int) $source->user_id : (int) $acteur->id;
    }

    /**
     * Le titulaire du bien est-il un bailleur de son agence (un profil propriétaire, de tout
     * statut, comme {@see BailleurDuBien}) ? Un bien sans agence n'a pas de bailleur d'agence.
     */
    public static function tenuParUnBailleur(Property $bien): bool
    {
        return $bien->agency_id !== null && $bien->user_id !== null
            && OwnerProfile::query()
                ->where('user_id', $bien->user_id)
                ->where('agency_id', $bien->agency_id)
                ->exists();
    }

    /**
     * Le bien vient de naître au nom d'un autre que son auteur : la désignation est journalisée (elle
     * décide à qui vont des loyers) et le bailleur en est prévenu (Q6).
     */
    public function annoncer(Property $bien, User $auteur, string $voie): void
    {
        if ((int) $bien->user_id === (int) $auteur->id) {
            return;
        }

        activity('Property')
            ->performedOn($bien)
            ->causedBy($auteur)
            ->withProperties(['owner_id' => (int) $bien->user_id, 'via' => $voie])
            ->event('owner_designated')
            ->log('owner_designated');

        $this->prevenir($bien);
    }

    /** Q6 — le bailleur au nom duquel le bien est désormais tenu en est prévenu. */
    public function prevenir(Property $bien): void
    {
        $bailleur = User::query()->find($bien->user_id);
        if ($bailleur !== null) {
            app(NotificationService::class)->send(
                $bailleur,
                NotificationCode::PropertyAssignedToOwner,
                ['property' => (string) $bien->title],
                NotificationTarget::of('property', $bien->id),
                agencyId: $bien->agency_id !== null ? (int) $bien->agency_id : null,
            );
        }
    }

    /** Un profil propriétaire ACTIF dans l'agence, et aucun profil actif de personnel. */
    public function bailleurActif(int $userId, int $agencyId): bool
    {
        $user = User::query()->find($userId);

        return $user !== null
            && OwnerProfile::query()->where('user_id', $userId)->where('agency_id', $agencyId)->active()->exists()
            && ! app(MembershipCapabilityResolver::class)->isStaffAt($user, $agencyId);
    }
}
