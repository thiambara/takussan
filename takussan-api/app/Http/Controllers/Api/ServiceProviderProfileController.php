<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\IncludedUserResource;
use App\Http\Resources\ServiceProviderDirectoryResource;
use App\Models\Agency;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\ServiceProviderProfile;
use App\Policies\Profiles\ServiceProviderProfilePolicy;
use App\Support\CaseInsensitive;
use App\Support\Http\ParametreUnique;
use App\Support\Query\CarnetInvitationsDeProfilsExistants;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

/**
 * TCK-260 — read-only listing of ServiceProviderProfile rows scoped to
 * the active agency via `service_provider_agency_collaborations`.
 *
 * Spatie/laravel-query-builder takes care of:
 *  - sparse fieldsets (`fields[service_provider_profiles]=...`)
 *  - filters (`filter[status]=draft|active|...`, `filter[search]=...`)
 *  - includes (`include=user,agencyCollaborations,invitations`)
 *  - sort (`sort=-created_at`)
 *
 * Visibility is gated by {@see ServiceProviderProfilePolicy::viewAny()}.
 */
class ServiceProviderProfileController extends Controller
{
    public function index(Request $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('viewAny', [ServiceProviderProfile::class, $agency])) {
            throw new AuthorizationException;
        }

        $statuses = $this->collaborationStatuses($request);
        $base = $this->scopeForAgency($agency, $statuses);
        $profils = ServiceProviderProfile::buildQuery($base, $request)
            ->defaultSort('-created_at')
            // TCK-597 (ADR-0043 §2) — la note moyenne des seuls avis approuvés, lue à la demande.
            ->withAvg(['reviews as average_rating' => fn (Builder $q) => $q->where('is_approved', true)], 'rating')
            ->withCount(['reviews as reviews_count' => fn (Builder $q) => $q->where('is_approved', true)])
            // TCK-1325 (P117.06) — le badge « Assuré » : une pièce d'assurance vivante existe.
            ->withExists('liveInsuranceDocuments as insured')
            // P237.01 (TCK-2371) — l'invitation `sent` du brouillon par CETTE agence : le front
            // relance ou révoque par elle (une invitation au seul numéro ne se cherchait pas).
            ->addSelect(['pending_invitation_id' => Invitation::idEnvoyeePour(new ServiceProviderProfile)
                ->where('invitations.agency_id', $agency->id)])
            // TCK-2652 — le téléphone joignable (compte, sinon invitation) et les interventions
            // réalisées pour CETTE agence, sans requête par ligne.
            ->addSelect([
                'account_phone' => ServiceProviderProfile::accountPhoneSubquery(),
                'completed_interventions_count' => ServiceProviderProfile::completedInterventionsSubquery($agency->id),
                // TCK-2772 — le délai de réponse médian sur les interventions de CETTE agence.
                'response_delay_minutes' => ServiceProviderProfile::responseDelaySubquery($agency->id),
            ]);

        // TCK-2834 — au carnet par défaut, les invitations à un prestataire déjà inscrit ailleurs : des
        // lignes construites depuis l'INVITATION (rien du profil maître), en tête du carnet. La page se
        // découpe sur la suite « invitations, puis profils » : aucune ligne répétée ni perdue d'une page
        // à l'autre, et `meta.total` compte les deux.
        $invitations = $statuses === null ? CarnetInvitationsDeProfilsExistants::lignes($agency, $request) : collect();
        $parPage = $this->tailleDePage($request, 20);
        $page = max(1, (int) ParametreUnique::valeur($request->input('page')));
        $debut = ($page - 1) * $parPage;
        $invitationsDeLaPage = $invitations->slice($debut, $parPage)->values();
        $place = $parPage - $invitationsDeLaPage->count();
        $totalProfils = $profils->toBase()->getCountForPagination();
        $modeles = $place > 0
            ? $profils->skip(max(0, $debut - $invitations->count()))->take($place)->get()
            : new EloquentCollection;

        // TCK-2834 — un profil collabore avec N agences et en reçoit N invitations : `include=` ne rend que
        // celles de l'agence du carnet. Sans cela, l'agence A lisait l'invitation que B venait d'envoyer
        // à son prestataire, et toute agence la liste des autres agences du prestataire.
        $this->restreindreLesInclusALAgence($modeles, $agency);

        // TCK-693 — le `User` inclus sort par sa projection fixe, jamais en ligne `users` entière.
        IncludedUserResource::preload($modeles->all());

        $paginator = new LengthAwarePaginator(
            $modeles,
            $totalProfils + $invitations->count(),
            $parPage,
            $page,
            ['path' => $request->url()],
        );

        // P21.06 (TCK-904) — ni `insurance_policy_id`, ni les sous-clés de `metadata` qu'aucun écran ne lit.
        // TCK-2772 — `meta.zones` : les zones du carnet de l'agence, lues sur une requête NEUVE du
        // périmètre (agence, statuts de collaboration) et non sur la requête filtrée : le sélecteur de
        // zone ne rétrécit pas sous une recherche ou une zone choisie. TCK-2834 — plus les zones
        // SAISIES sur les invitations du carnet par défaut.
        $zones = ServiceProviderProfile::zonesOf($this->scopeForAgency($agency, $statuses));
        if ($statuses === null) {
            $zones = $this->fusionnerLesZones($zones, CarnetInvitationsDeProfilsExistants::zones($agency));
        }

        return $this->paginated(
            $paginator,
            [
                ...$invitationsDeLaPage->all(),
                ...ServiceProviderDirectoryResource::collection($modeles)->toArray($request),
            ],
            ['zones' => $zones],
        );
    }

    /**
     * TCK-2834 — les relations inclusibles qui portent une agence (`invitations`, `agencyCollaborations`,
     * `agencies`) ne gardent que les lignes de l'agence du carnet.
     *
     * @param  EloquentCollection<int, ServiceProviderProfile>  $modeles
     */
    private function restreindreLesInclusALAgence(EloquentCollection $modeles, Agency $agency): void
    {
        $cles = ['invitations' => 'agency_id', 'agencyCollaborations' => 'agency_id', 'agencies' => 'id'];
        foreach ($modeles as $modele) {
            foreach ($cles as $relation => $colonne) {
                if ($modele->relationLoaded($relation)) {
                    $modele->setRelation($relation, $modele->getRelation($relation)
                        ->filter(fn ($ligne): bool => (int) $ligne->{$colonne} === (int) $agency->id)
                        ->values());
                }
            }
        }
    }

    /**
     * TCK-2834 — deux listes de zones en une, sans doublon, dans l'ordre de la collation racine de
     * {@see ServiceProviderProfile::zonesOf()} (`École` avec les `E`).
     *
     * @param  list<string>  $zones
     * @param  list<string>  $autres
     * @return list<string>
     */
    private function fusionnerLesZones(array $zones, array $autres): array
    {
        if ($autres === []) {
            return $zones;
        }

        $distinctes = DB::query()
            ->fromRaw('json_array_elements_text(?::json) as toutes(zone)', [json_encode(array_values([...$zones, ...$autres]))])
            ->selectRaw('distinct toutes.zone as zone')
            ->whereRaw("trim(toutes.zone) <> ''");

        return DB::query()->fromSub($distinctes, 'zones')
            ->orderByRaw('zones.zone COLLATE "'.CaseInsensitive::COLLATION.'"')
            ->pluck('zone')
            ->map(fn ($zone): string => (string) $zone)
            ->values()
            ->all();
    }

    /**
     * Le profil SP est rattaché à l'agence via la table pivot
     * `service_provider_agency_collaborations` ; on filtre via un
     * `whereHas` plutôt qu'une jointure pour rester compatible avec
     * spatie/laravel-query-builder (les sparse fieldsets sont plus
     * propres sans aliasing manuel).
     *
     * TCK-592 — le statut DU COUPLE (profil, cette agence) : un prestataire dont la collaboration a
     * pris fin ne figure plus dans le carnet, sauf à le demander.
     *
     * TCK-2829 — `$statuses === null` est le carnet PAR DÉFAUT : les collaborations `active` ET les
     * invitations en attente de cette agence — un profil `draft` (pas encore accepté), sa
     * collaboration `paused` avec elle, et une invitation `sent` de CETTE agence (celle que rend
     * `pending_invitation_id`). Une collaboration `paused` d'un profil non `draft` est une
     * suspension : hors du défaut. Le OU vit dans UN `where` groupé, pour que les filtres de spatie
     * posés ensuite (recherche, zone, statut) s'appliquent aussi aux invitations.
     *
     * @param  list<string>|null  $statuses
     */
    protected function scopeForAgency(Agency $agency, ?array $statuses): Builder
    {
        if ($statuses !== null) {
            return ServiceProviderProfile::query()
                ->whereHas('agencyCollaborations', function (Builder $query) use ($agency, $statuses): void {
                    $query->where('agency_id', $agency->id)->whereIn('status', $statuses);
                });
        }

        return ServiceProviderProfile::query()->where(function (Builder $carnet) use ($agency): void {
            $carnet
                ->whereHas('agencyCollaborations', function (Builder $query) use ($agency): void {
                    $query->where('agency_id', $agency->id)->where('status', CollaborationStatus::Active->value);
                })
                ->orWhere(function (Builder $invitation) use ($agency): void {
                    $invitation
                        ->where('service_provider_profiles.status', ServiceProviderProfileStatus::Draft->value)
                        ->whereHas('agencyCollaborations', function (Builder $query) use ($agency): void {
                            $query->where('agency_id', $agency->id)->where('status', CollaborationStatus::Paused->value);
                        })
                        ->whereExists(Invitation::idEnvoyeePour(new ServiceProviderProfile)
                            ->where('invitations.agency_id', $agency->id));
                });
        });
    }

    /**
     * `filter[collaboration_status]=active,paused` — liste à virgules, comme les autres filtres spatie.
     * Une valeur inconnue est ignorée ; aucune valeur connue → `null`, le carnet par défaut
     * (`active` + invitations en attente, TCK-2829).
     *
     * @return list<string>|null
     */
    private function collaborationStatuses(Request $request): ?array
    {
        $raw = $request->input('filter.collaboration_status');
        $values = is_array($raw) ? $raw : explode(',', (string) $raw);

        $statuses = collect($values)
            ->map(fn ($value) => CollaborationStatus::tryFrom(trim((string) $value))?->value)
            ->filter()
            ->unique()
            ->values()
            ->all();

        return $statuses === [] ? null : $statuses;
    }
}
