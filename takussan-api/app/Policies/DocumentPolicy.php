<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Property\BailleurDuBien;
use App\Support\ImpersonationContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `DocumentController::authorizeAccess()` / `authorizeManage()` /
 * `authorizeUpload()` et de `DocumentVersionController::ensureCanActOn()` /
 * `checkDocumentableAccess()`.
 *
 * **Ces deux contrôleurs portaient la MÊME règle en double**, et le dépôt le savait : le docblock
 * de `checkDocumentableAccess()` disait « Mirrors DocumentController::authorizeUpload() without
 * the abort_unless ». *Un commentaire qui annonce une duplication ne la corrige pas — il la
 * documente, et il vieillit avec elle.* Sept branches polymorphes recopiées à l'identique : la
 * première divergence aurait été invisible.
 */
class DocumentPolicy extends BasePolicy
{
    /**
     * Lire un document : super-admin, celui qui l'a téléversé, ou quiconque a accès au modèle
     * auquel il est rattaché. Un document orphelin (`documentable` nul) est refusé.
     *
     * TCK-697 (P23.01, ADR-0055 §3) — sous impersonation, une pièce rattachée à un profil
     * (`Document::isProfilePiece()`) est refusée à tous : `api/kyc/documents/*` l'est déjà pour la
     * pièce d'agence, et aucune voie de la console ne sert celles-ci sous le nom de l'opérateur.
     */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof Document) {
            return false;
        }

        if ($model->isProfilePiece() && app(ImpersonationContext::class)->active()) {
            return false;
        }

        // P218.06 (TCK-2295) — le téléverseur, selon la règle d'auteur (ADR-0031, amendement du
        // 2026-10-25, D3) : l'agent suspendu ou retiré n'y entre plus par sa seule signature.
        if ($user->isSuperAdmin() || $this->televerseurGarde($user, $model, writing: false)) {
            return true;
        }

        $documentable = $model->documentable;

        return $documentable !== null && $this->reaches($user, $documentable, writing: false);
    }

    /**
     * Administrer un document : super-admin ou celui qui l'a téléversé, **et personne d'autre** —
     * ni l'agence, ni le propriétaire du modèle rattaché.
     *
     * ⚠ C'est la règle la plus étroite du lot, et elle diverge de `view()` bien plus qu'ailleurs.
     * `DocumentVersionController` employait pourtant `ensureCanActOn()` — donc la règle de
     * `view()` — pour ses DEUX helpers, `authorizeAccess` comme `authorizeManage`. Les deux
     * contrôleurs ne s'accordaient donc pas sur ce que « gérer un document » veut dire ; la
     * migration conserve chaque appel sur l'ability qu'il exerçait réellement, elle ne les
     * réconcilie pas en douce.
     *
     * TCK-587 (ADR-0031 §2, passe 2 N2) — un téléverseur suspendu comme bailleur dans l'agence du
     * porteur le lit encore, il ne le modifie ni ne le supprime plus.
     */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof Document) {
            return false;
        }

        // P218.06 (TCK-2295) — `landlordWrites` gardé, et la règle d'auteur en écriture.
        return $user->isSuperAdmin()
            || ($this->landlordWrites($user, $model->uploaded_by, $this->agencyOf($model))
                && $this->televerseurGarde($user, $model, writing: true));
    }

    /**
     * Partager un document par lien public : super-admin, le téléverseur, le propriétaire du
     * porteur (`user_id`), ou le personnel de l'agence du porteur — la règle de
     * `StoreDocumentShareLinkRequest`, qui la reprenait d'un contrôleur (TCK-305) et y délègue
     * désormais.
     *
     * TCK-587 (ADR-0031 §2, passe 2 N2) — publier un lien est une écriture : un bailleur suspendu
     * dans l'agence du porteur ne publie plus de lien vers un document de cette agence.
     */
    public function share(User $user, Model $model): bool
    {
        if (! $model instanceof Document) {
            return false;
        }

        $porteur = $model->documentable;
        $agencyId = $this->agencyOf($model);

        return $user->isSuperAdmin()
            || ($this->landlordWrites($user, $model->uploaded_by, $agencyId)
                && $this->televerseurGarde($user, $model, writing: true))
            || ($porteur && isset($porteur->user_id) && $this->landlordWrites($user, $porteur->user_id, $agencyId))
            || ($porteur && isset($porteur->agency_id) && $this->isStaffOf($user, $porteur->agency_id));
    }

    /** L'agence du porteur : sa colonne `agency_id`, ou l'agence elle-même. Nulle pour un `User`. */
    private function agencyOf(Document $document): ?int
    {
        $porteur = $document->documentable;

        if ($porteur instanceof Agency) {
            return (int) $porteur->id;
        }

        return isset($porteur?->agency_id) ? (int) $porteur->agency_id : null;
    }

    /**
     * P218.06 (TCK-2295) — ADR-0031, amendement du 2026-10-25 (D3) : la branche du TÉLÉVERSEUR
     * (`uploaded_by`) suit la règle d'auteur. Elle vaut si le document est sans agence, si c'est une
     * pièce du propre profil du téléverseur, si le téléverseur est encore membre de l'agence
     * (`isMemberAt`), ou :
     *
     * - en lecture, s'il y détient un profil propriétaire de tout statut (l'exception de l'état
     *   des lieux, B.3 : le bailleur bloqué garde la lecture) ;
     * - en écriture, si une autre branche le fait atteindre le porteur en écriture (`reaches`) :
     *   le locataire et le client gardent les gestes sur la pièce qu'ils ont jointe.
     *
     * Le relevé par sonde (TCK-2295) l'a établi : tout lecteur légitime qui a téléversé sans être
     * membre atteint le porteur par une branche qui n'est pas d'auteur. La règle n'atteint que le
     * personnel parti. Forme SQL : {@see self::restreindreAuTeleverseur()}.
     */
    private function televerseurGarde(User $user, Document $document, bool $writing): bool
    {
        if ($document->uploaded_by === null || (int) $document->uploaded_by !== $user->id) {
            return false;
        }

        $agencyId = self::agenceDeLaRegle($document);
        $porteur = $document->documentable;
        if ($agencyId === null || $this->estSonProfil($user, $document)) {
            return true;
        }

        if (self::auteurEncoreMembre($user, $document->uploaded_by, $agencyId)) {
            return true;
        }

        return $writing
            ? $porteur !== null && $this->reaches($user, $porteur, writing: true)
            : $user->ownerProfiles()->where('agency_id', $agencyId)->exists();
    }

    /** Une pièce rattachée à un profil que l'utilisateur détient lui-même. */
    private function estSonProfil(User $user, Document $document): bool
    {
        return in_array($document->documentable_type, Document::PROFILE_TYPES, true)
            && (int) ($document->documentable?->user_id ?? 0) === $user->id;
    }

    /**
     * L'agence que la règle d'auteur juge : celle du porteur, et pour un état des lieux, qui n'a pas
     * de colonne `agency_id`, celle de son bien. {@see self::agencyOf()} reste tel quel pour
     * `landlordWrites` et `share`.
     */
    private static function agenceDeLaRegle(Document $document): ?int
    {
        $porteur = $document->documentable;
        if ($porteur instanceof Inventory) {
            $agencyId = $porteur->property?->agency_id;

            return $agencyId !== null ? (int) $agencyId : null;
        }

        if ($porteur instanceof Agency) {
            return (int) $porteur->id;
        }

        return isset($porteur?->agency_id) ? (int) $porteur->agency_id : null;
    }

    /**
     * P218.06 (TCK-2295) — la forme SQL de {@see self::televerseurGarde()} en lecture, pour la liste
     * de `DocumentController::index` (« ses propres téléversements ») : sont retirés les documents
     * dont le porteur est d'une agence où l'appelant n'est ni membre ni propriétaire de tout statut,
     * sauf s'il atteint le porteur par une branche qui n'est pas d'auteur (locataire du bail, client
     * de la réservation ou de la fiche, titulaire du profil). Un porteur supprimé ne retire rien :
     * `view` le juge sans agence.
     *
     * @param  Builder<Document>  $query
     * @return Builder<Document>
     */
    public static function restreindreAuTeleverseur(Builder $query, User $user): Builder
    {
        $resolver = app(MembershipCapabilityResolver::class);
        $gardees = collect($resolver->memberAgencyIds($user))
            ->merge($user->ownerProfiles()->pluck('agency_id'))
            ->filter()->map(fn ($id) => (int) $id)->unique()->values()->all();

        $horsAgence = fn (Builder $q, string $colonne = 'agency_id') => $q
            ->whereNotNull($colonne)
            ->when($gardees !== [], fn (Builder $q) => $q->whereNotIn($colonne, $gardees));

        return $query
            ->where('uploaded_by', $user->id)
            // `whereNot(whereHasMorph)` et non `whereDoesntHaveMorph`, qui écarterait aussi tout
            // document d'un type hors de la liste (un `User`, un profil de prestataire).
            ->whereNot(fn (Builder $q) => $q->whereHasMorph('documentable', [
                Property::class, Lease::class, Booking::class, Customer::class, Agency::class,
                Inventory::class, AgencyUpgradeRequest::class,
                OwnerProfile::class, AgentProfile::class, AgencyAdminProfile::class,
            ], function (Builder $q, string $type) use ($user, $horsAgence): void {
                match ($type) {
                    Agency::class => $horsAgence($q, 'id'),
                    Inventory::class => $q->whereHas('property', fn (Builder $p) => $horsAgence($p)),
                    Lease::class => $horsAgence($q)
                        ->whereDoesntHave('tenant', fn (Builder $t) => $t->where('user_id', $user->id)),
                    Booking::class => $horsAgence($q)
                        ->whereDoesntHave('customer', fn (Builder $c) => $c->where('user_id', $user->id)),
                    Customer::class => $horsAgence($q)
                        ->where(fn (Builder $c) => $c->whereNull('user_id')->orWhere('user_id', '!=', $user->id)),
                    OwnerProfile::class, AgentProfile::class, AgencyAdminProfile::class => $horsAgence($q)
                        ->where('user_id', '!=', $user->id),
                    default => $horsAgence($q),
                };
            }));
    }

    /**
     * TCK-587 — supprimer un document : la règle d'`update()`, inchangée (le téléverseur seul).
     *
     * `DocumentController::destroy` autorisait par `update` ; il autorise désormais par `delete`,
     * et cette surcharge est ce qui l'empêche d'être fermé à tous : `BasePolicy::delete()` sans
     * capacité déclarée n'accorde qu'au super-admin.
     */
    public function delete(User $user, Model $model): bool
    {
        // TCK-1062 (P64.03) — une pièce de profil vérifiée ne se supprime pas par son titulaire :
        // supprimée en douceur, son fichier partirait au bout de 90 jours (`media:cleanup`), contre
        // les 5 ans de la politique. Le super-admin garde le geste (décision du porteur, 2026-10-20).
        if ($model instanceof Document && $model->is_verified && $model->isProfilePiece() && ! $user->isSuperAdmin()) {
            return false;
        }

        return $this->update($user, $model);
    }

    /**
     * TCK-306 — reprise de `authorizeUpload()` : a-t-on accès au modèle porteur ?
     *
     * Sept branches, une par type de `documentable`. Elles ne se déduisent pas les unes des
     * autres : `Property` regarde `user_id`, `Lease` ajoute le locataire, `Customer` regarde DEUX
     * colonnes de propriété, `User` n'autorise que soi-même, et `Agency` compare l'agence à
     * l'identifiant du modèle et non à une colonne `agency_id`.
     *
     * TCK-587 (ADR-0031) — chaque « périmètre d'agence » est le PERSONNEL de l'agence : un bailleur
     * de l'agence lisait les documents des biens, baux, réservations, clients et de l'agence d'un
     * autre bailleur.
     *
     * TCK-1142 (P82.02, ADR-0031 §2) — joindre un document est une ÉCRITURE : le bailleur suspendu
     * dans l'agence du porteur n'y rattache plus de pièce (`landlordWrites`). La LECTURE (`view()`)
     * lui reste, d'où le partage en `reaches()` : remplacer les comparaisons dans cette seule
     * méthode, que `view()` appelait, lui aurait aussi retiré la lecture des documents de son bail.
     */
    public function attachTo(User $user, Model $documentable): bool
    {
        return $this->reaches($user, $documentable, writing: true);
    }

    /**
     * L'accès au porteur, en lecture (`view()`) ou en écriture (`attachTo()`). Les deux ne
     * diffèrent que sur les branches du bailleur : en écriture, elles passent par `bailleurEcrit`
     * (TCK-2027 : `landlordWrites` avant), en lecture par `BailleurDuBien::est`.
     */
    private function reaches(User $user, Model $documentable, bool $writing): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        // TCK-2027 (P190.05) — `$bailleur` ne reçoit que des colonnes de BAILLEUR
        // (`properties.user_id`, `leases.landlord_id`) : l'utilisateur désigné n'en est le bailleur
        // qu'au sens de `BailleurDuBien`, de tout statut en lecture, non bloqué en écriture.
        // L'agent qui a saisi le bien entre par la branche du personnel, et seulement actif. Les
        // colonnes d'AUTEUR (`uploaded_by`, `conducted_by`, `created_by_id`) restent jugées à part.
        $bailleur = fn (mixed $landlordId, mixed $agencyId): bool => $writing
            ? $this->bailleurEcrit($user, $landlordId, $agencyId)
            : BailleurDuBien::est($user, $landlordId, $agencyId);

        if ($documentable instanceof Property) {
            return $bailleur($documentable->user_id, $documentable->agency_id)
                || $this->isStaffOf($user, $documentable->agency_id);
        }

        if ($documentable instanceof Lease) {
            return $bailleur($documentable->landlord_id, $documentable->agency_id)
                || $this->isStaffOf($user, $documentable->agency_id)
                || ($documentable->tenant && $documentable->tenant->user_id === $user->id);
        }

        if ($documentable instanceof Booking) {
            $property = $documentable->property;

            // P218.06 (TCK-2295) — le créateur encore membre (règle d'auteur, comme
            // `BookingPolicy::view`) ; le client du tunnel public garde les documents de sa
            // réservation par la branche du client, en lecture comme pour en joindre.
            return self::auteurEncoreMembre($user, $documentable->created_by_id, $documentable->agency_id)
                || ($documentable->customer && $documentable->customer->user_id === $user->id)
                || ($property && $bailleur($property->user_id, $property->agency_id))
                || $this->isStaffOf($user, $documentable->agency_id);
        }

        if ($documentable instanceof Customer) {
            // P218.06 (TCK-2295) — l'auteur de la fiche encore membre, comme `CustomerPolicy`.
            return self::auteurEncoreMembre($user, $documentable->added_by_id, $documentable->agency_id)
                || $documentable->user_id === $user->id
                || $this->isStaffOf($user, $documentable->agency_id);
        }

        if ($documentable instanceof User) {
            return $documentable->id === $user->id;
        }

        if ($documentable instanceof Agency) {
            // TCK-587 — les documents de l'AGENCE elle-même (KYC, statuts) : son personnel seul.
            return $this->isStaffOf($user, $documentable->id);
        }

        if ($documentable instanceof Inventory) {
            // P218.06 (TCK-2295) — le conducteur selon l'exception de l'état des lieux (B.3), la forme
            // d'`InventoryPolicy` : en écriture `landlordWrites` et encore membre ; en lecture encore
            // membre, ou propriétaire de tout statut dans l'agence du bien.
            $agencyId = $documentable->property?->agency_id;
            $conducteur = $writing
                ? $this->landlordWrites($user, $documentable->conducted_by, $agencyId)
                    && self::auteurEncoreMembre($user, $documentable->conducted_by, $agencyId)
                : self::auteurEncoreMembre($user, $documentable->conducted_by, $agencyId)
                    || ($agencyId !== null && $documentable->conducted_by === $user->id
                        && $user->ownerProfiles()->where('agency_id', $agencyId)->exists());

            return $conducteur
                || ($documentable->property && $bailleur($documentable->property->user_id, $documentable->property->agency_id))
                || ($documentable->property && $this->isStaffOf($user, $documentable->property->agency_id));
        }

        return false;
    }
}
