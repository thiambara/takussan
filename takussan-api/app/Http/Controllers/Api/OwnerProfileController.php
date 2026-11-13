<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Owners\ShowOwnerProfileRequest;
use App\Http\Requests\Api\Owners\UpdateOwnerProfileRequest;
use App\Http\Resources\IncludedUserResource;
use App\Http\Resources\OwnerProfileDetailResource;
use App\Http\Resources\OwnerProfileResource;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Policies\OwnerProfilePolicy;
use App\Services\Owners\OwnerDirectory;
use App\Services\Privacy\PersonalDataAccessLogger;
use App\Support\AgencyKindGuard;
use App\Support\Http\ParametreUnique;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-256 — read-only listing of OwnerProfile rows scoped to the
 * actor's active agency.
 *
 * Spatie/laravel-query-builder takes care of:
 *  - sparse fieldsets (`fields[owner_profiles]=...`)
 *  - filters (`filter[status]=draft|active|...`, `filter[search]=...`)
 *  - includes (`include=user`)
 *  - sort (`sort=-created_at`)
 *
 * TCK-601 (ADR-0044 §1) — la liste passe par {@see OwnerProfileResource} : elle
 * n'expose plus que les colonnes demandées par `fields[]` et des formes MASQUÉES
 * du RIB, du NINEA et du numéro de pièce. La valeur complète sort par
 * {@see self::sensitive()} seulement. Visibility is gated by
 * {@see OwnerProfilePolicy::viewAny()}, puis par
 * {@see AgencyKindGuard::ensureStandardForNonGlobal()} — TCK-284.
 */
class OwnerProfileController extends Controller
{
    public function __construct(private readonly OwnerDirectory $directory) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('viewAny', OwnerProfile::class)) {
            throw new AuthorizationException;
        }

        // TCK-284 — le carnet de propriétaires est réservé aux agences
        // `standard` (TCK-256, confirmé : dans une agence `individual`, le
        // propriétaire est le créateur du compte lui-même). La règle n'était
        // tenue que sur l'invitation et sur l'écran Next ; la LECTURE restait
        // ouverte à un appel direct.
        //
        // Placée APRÈS `viewAny` à dessein : seul un acteur qui aurait été
        // autorisé reçoit « réservé aux agences standard ». Les autres gardent
        // leur refus d'autorisation, qui dit vrai. Le périmètre reste donc
        // exactement celui de `viewAny` — agency_admin et agent de l'agence —
        // et n'atteint aucun autre rôle.
        AgencyKindGuard::ensureStandardForNonGlobal($user, $user->agency_id);

        // TCK-2760 (suivi) — les soldes du périmètre du résumé, le plus large de la requête, d'abord : le
        // filtre `has_remaining`, le tri, la ligne et la somme de tête les relisent ensuite sans les
        // recalculer ({@see OwnerDirectory::remainingToPay()}), une passe par agence au lieu de trois.
        if (OwnerDirectory::readsMoney($user) && ($perimeter = $this->summaryPerimeter($user, $request)) !== null) {
            $this->directory->remainingToPayIn($perimeter);
        }

        $base = $this->visibleScope($user, $request);
        $query = OwnerProfile::buildQuery($base, $request)->defaultSort('-created_at');

        // TCK-601 — les colonnes sensibles ne sont plus demandables par `fields[]` ; elles sont
        // chargées ici pour que la Resource en calcule le MASQUE. Sans `fields[]`, `select *` les
        // charge déjà.
        if ($query->getQuery()->columns !== null) {
            $query->addSelect(array_map(
                static fn (string $column): string => 'owner_profiles.'.$column,
                OwnerProfile::SENSITIVE,
            ));
        }

        // P237.01 (TCK-2371) — l'invitation `sent` du brouillon, émise par l'agence du profil : le
        // front relance ou révoque par elle (une invitation au seul numéro ne se cherchait pas).
        $query->addSelect(['pending_invitation_id' => Invitation::idEnvoyeePour(new OwnerProfile)
            ->whereColumn('invitations.agency_id', 'owner_profiles.agency_id')]);
        // TCK-2641 (5a) — et la date de son dernier envoi (« invitation envoyée il y a 3 j »).
        $query->addSelect(['pending_invitation_sent_at' => OwnerDirectory::pendingInvitationSentAt()]);
        $query->getEloquentBuilder()->withCasts(['pending_invitation_sent_at' => 'datetime']);

        // TCK-2640 — les chiffres de la ligne : comptes de biens, dernier versement, contact du
        // compte, en sous-requêtes ; le reste à verser du mois courant, lu au relevé servi pour la
        // page entière en une passe. `user_id` et `agency_id` sont chargés pour ce calcul.
        $this->directory->addListColumns($query->getEloquentBuilder());
        if ($query->getQuery()->columns !== null) {
            $query->addSelect(['owner_profiles.user_id', 'owner_profiles.agency_id', 'owner_profiles.metadata']);
        }

        $paginator = $query->paginate($this->tailleDePage($request, 20));

        $profiles = collect($paginator->items());
        $this->directory->fillContactFallbacks($profiles);
        // Vérification adverse de TCK-2640 — les chiffres d'argent au seul lecteur du relevé.
        $readsMoney = OwnerDirectory::readsMoney($user);
        // TCK-2641 — l'encaissé du mois (`gross` du relevé servi) sort de la même passe.
        $figures = $readsMoney ? $this->directory->monthFigures($profiles) : [];
        foreach ($profiles as $profile) {
            $profile->setAttribute('remaining_to_pay', $figures[(int) $profile->id]['remaining_to_pay'] ?? null);
            $profile->setAttribute('collected_this_month', $figures[(int) $profile->id]['collected'] ?? null);
            if (! $readsMoney) {
                $profile->setAttribute('last_payout_at', null);
            }
        }

        IncludedUserResource::preload($paginator->items());

        return $this->paginated($paginator, OwnerProfileResource::collection($paginator)->resolve($request), [
            'summary' => $this->summary($user, $request, $readsMoney),
        ]);
    }

    /**
     * TCK-2640 — la fiche d'un bailleur du carnet : identité, contact, biens, les chiffres du mois du
     * relevé servi (`period`, le mois courant par défaut), le dernier versement, le plafond de
     * travaux et le taux de l'agence. 404 hors de l'agence, 403 pour l'agent et une agence
     * `individual` ({@see ShowOwnerProfileRequest}).
     */
    public function show(ShowOwnerProfileRequest $request, OwnerProfile $ownerProfile): JsonResponse
    {
        return $this->json(['data' => OwnerProfileDetailResource::make($this->directory->detail($ownerProfile, $request->period(), OwnerDirectory::readsMoney($request->user())))->resolve($request)]);
    }

    /**
     * TCK-2640 — le plafond de travaux (ADR-0037), réglé par l'admin (`owners.update`). Il vaut pour
     * les décisions À VENIR : il est lu à l'approbation d'un devis, et rien de ce qui est déjà
     * tranché ou en attente du bailleur ne bouge. L'écriture est journalisée (avant, après, auteur)
     * — le journal automatique du profil ne retient que `AUDIT_ONLY`.
     */
    public function update(UpdateOwnerProfileRequest $request, OwnerProfile $ownerProfile): JsonResponse
    {
        $before = $ownerProfile->works_approval_threshold !== null ? (float) $ownerProfile->works_approval_threshold : null;
        $value = $request->input('works_approval_threshold');
        $after = $value !== null ? round((float) $value, 2) : null;

        if ($before !== $after) {
            $ownerProfile->forceFill(['works_approval_threshold' => $after])->save();

            activity('OwnerProfile')
                ->causedBy($request->user())
                ->performedOn($ownerProfile)
                ->withProperties(['before' => $before, 'after' => $after])
                ->event('owner_works_threshold_updated')
                ->log('owner_works_threshold_updated');
        }

        return $this->json(['data' => OwnerProfileDetailResource::make($this->directory->detail($ownerProfile->refresh(), OwnerDirectory::currentPeriod(), OwnerDirectory::readsMoney($request->user())))->resolve($request)]);
    }

    /**
     * TCK-601 (ADR-0044 §1, §4) — le RIB, le NINEA et le numéro de pièce EN CLAIR, pour l'admin de
     * l'agence du profil (et le super-admin, par `Gate::before`). Chaque consultation est
     * journalisée ; l'agent n'y a pas accès.
     */
    public function sensitive(Request $request, OwnerProfile $ownerProfile, PersonalDataAccessLogger $accessLog): JsonResponse
    {
        // Comme la fiche (`ShowOwnerProfileRequest`) : un profil hors de l'agence du personnel de
        // l'appelant n'existe pas pour lui — 404, comme un identifiant inexistant, jamais un 403 qui
        // dirait qu'il existe. Dans l'agence, le refus de la policy (l'agent) reste un 403.
        abort_unless(OwnerProfilePolicy::isInActorAgency($request->user(), $ownerProfile), 404);
        $this->authorize('viewSensitive', $ownerProfile);

        $accessLog->record($request->user(), $ownerProfile, PersonalDataAccessLogger::SURFACE_OWNER_SENSITIVE);

        return $this->json([
            'data' => [
                'id' => $ownerProfile->id,
                'rib' => $ownerProfile->rib,
                'tax_id' => $ownerProfile->tax_id,
                'id_document_type' => $ownerProfile->id_document_type?->value,
                'id_document_number' => $ownerProfile->id_document_number,
                // TCK-956 (ADR-0070 § 5) — le revenu en nombre ; le cast `encrypted` le relit en chaîne.
                'monthly_income' => $ownerProfile->monthly_income !== null ? (float) $ownerProfile->monthly_income : null,
            ],
        ]);
    }

    /**
     * TCK-2641 (décision 4a) — le résumé du carnet ({@see OwnerDirectory::summary()}) : le périmètre
     * de lecture des lignes (`visibleScope`) et l'agence que filtre `filter[agency_id]` — c'est le
     * périmètre, pas une vue —, sans la recherche, ni le statut, ni `has_remaining`, ni la page.
     * Le super-admin qui ne filtre pas UNE agence lit toute la plateforme : il n'a pas de résumé
     * (`null`), le reste à verser s'y calculerait agence par agence sur tout le parc.
     *
     * ⚠ Un périmètre NEUF : `buildQuery()` filtre, trie et sélectionne sur le builder même qu'il
     * reçoit — celui des lignes porte déjà la recherche et la vue.
     *
     * @return array<string, int|float|null>|null
     */
    private function summary(User $user, Request $request, bool $readsMoney): ?array
    {
        $perimeter = $this->summaryPerimeter($user, $request);

        return $perimeter === null ? null : $this->directory->summary($perimeter, $readsMoney);
    }

    /**
     * Le périmètre du résumé ({@see self::summary()}), `null` pour le super-admin qui ne filtre pas UNE
     * agence. Un périmètre neuf à chaque appel.
     *
     * @return Builder<OwnerProfile>|null
     */
    private function summaryPerimeter(User $user, Request $request): ?Builder
    {
        $filtered = ParametreUnique::valeur($request->input('filter.agency_id'));
        $agencyId = $filtered !== null && ctype_digit($filtered) ? (int) $filtered : null;
        if ($agencyId === null && $user->isSuperAdmin()) {
            return null;
        }

        $perimeter = $this->visibleScope($user, $request);
        if ($agencyId !== null) {
            $perimeter->where('owner_profiles.agency_id', $agencyId);
        }

        return $perimeter;
    }

    /**
     * super_admin sees everything; agency-side roles see their agency
     * only; everyone else sees nothing (defensive — `viewAny` already
     * filters out non-agency roles).
     */
    protected function visibleScope(User $user, Request $request): Builder
    {
        if ($user->isSuperAdmin()) {
            return OwnerProfile::query();
        }

        $agencyId = $user->agency_id;

        return OwnerProfile::query()->where('agency_id', $agencyId);
    }
}
