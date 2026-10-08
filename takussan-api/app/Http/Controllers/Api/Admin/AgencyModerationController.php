<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Notifications\NotificationCode;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Admin\ReinstateAgencyRequest;
use App\Http\Requests\Admin\SuspendAgencyRequest;
use App\Http\Resources\Api\Admin\AgencyResource;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\KycDossierStatus;
use App\Services\Lead\ContactLeadService;
use App\Services\Model\NotificationService;
use App\Support\CaseInsensitive;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-144 — Agency moderation (super-admin only). The verify / suspend /
 * unverify lifecycle is mapped onto `AgencyStatus` because the data model
 * already carries `is_verified` + `verified_at` — no schema change.
 *
 *   verify   → status=Active,    is_verified=true,  verified_at=now()
 *   suspend  → status=Suspended  (verification flag preserved)
 *   unverify → status=Inactive,  is_verified=false, verified_at=null
 *   reinstate → status=Active    (TCK-600 : suspended seulement, vérification intacte)
 *
 * TCK-600 (ADR-0048) — suspendre et lever exigent un MOTIF, journalisé et adressé aux admins
 * de l'agence. Les effets de la suspension ne sont pas ici : ils sont LUS en aval, par la
 * visibilité publique (`Property::scopePublic`), le verrou d'écriture (`EnsureAgencyWritable`),
 * le résolveur de capacités et l'index (`AgencyObserver`).
 *
 * Each transition writes a `super_admin_agency_*` activity log entry tied to
 * the actor and the target agency.
 */
class AgencyModerationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Agency::query()
            ->select('agencies.*')
            // ⚠ ALIAS EXPLICITE, et ce n'est pas de la cosmétique : `agencies` porte une
            // VRAIE colonne `properties_count`, dénormalisée et maintenue par
            // `PropertyObserver` (increment/decrement). Un `withCount('properties')` nu en
            // ajoutait une SECONDE du même nom, si bien que la requête rendait deux
            // colonnes homonymes — et que la valeur servie par l'API dépendait de quelle
            // colonne le moteur choisissait.
            //
            // PostgreSQL a refusé de choisir (« ORDER BY "properties_count" is ambiguous »),
            // ce qui a rendu le défaut visible ; MySQL et SQLite choisissaient en silence.
            // Le tri `sort=-properties_count` s'appliquait donc à une colonne que personne
            // n'avait décidée, et rien ne pouvait le signaler.
            //
            // On garde le compte VIVANT — c'est ce que le code demandait explicitement, et
            // lui seul exclut les biens supprimés en douceur (`deleted_at is null`), là où
            // le compteur dénormalisé dépend de la bonne tenue de l'observateur.
            ->withCount('properties as live_properties_count')
            ->selectSub($this->memberCountSubquery(), 'members_count')
            ->selectSub($this->lastActivitySubquery(), 'last_activity_at');

        if ($status = $request->string('filter.status')->trim()->value()) {
            if ($enum = AgencyStatus::tryFrom($status)) {
                $query->where('status', $enum);
            }
        }

        if ($search = $request->string('filter.search')->trim()->value()) {
            $query->where(function ($q) use ($search): void {
                // TCK-600 — insensible à la casse ET aux majuscules accentuées : « keur » trouve
                // « Keur Immo », « café » trouve « CAFÉ IMMO » (`CaseInsensitive`, ADR-0025).
                $motif = '%'.addcslashes(CaseInsensitive::fold($search), '\\%_').'%';
                $q->whereRaw(CaseInsensitive::sql('name').' like ?', [$motif])
                    ->orWhereRaw(CaseInsensitive::sql('slug').' like ?', [$motif])
                    ->orWhereRaw(CaseInsensitive::sql('email').' like ?', [$motif]);
            });
        }

        // TCK-390 — `is_verified` figure bien dans `Agency::$requestFilterable`, mais cette
        // liste n'ouvre un filtre que pour les contrôleurs qui empruntent `HasQueryBuilder`.
        // Celui-ci lit ses filtres À LA MAIN : le paramètre partait donc à la poubelle en
        // silence, et la tuile « Vérifiées » de l'accueil ne pouvait pas mener à une vue
        // filtrée — elle pointait sur le même href que « Agences (total) ».
        //
        // Une valeur non booléenne ne filtre PAS (même repli que `filter.status`, dont un
        // `AgencyStatus::tryFrom()` raté laisse la requête intacte) : filtrer sur du vide
        // rendrait une liste que rien dans l'écran n'expliquerait.
        $rawVerified = $request->string('filter.is_verified')->trim()->value();
        if ($rawVerified !== '') {
            $isVerified = filter_var($rawVerified, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
            if ($isVerified !== null) {
                $query->where('agencies.is_verified', $isVerified);
            }
        }

        if ($createdFrom = $request->string('filter.created_from')->trim()->value()) {
            $query->whereDate('agencies.created_at', '>=', $createdFrom);
        }

        if ($createdTo = $request->string('filter.created_to')->trim()->value()) {
            $query->whereDate('agencies.created_at', '<=', $createdTo);
        }

        $sort = (string) $request->query('sort', '-created_at');
        $direction = str_starts_with($sort, '-') ? 'desc' : 'asc';
        $field = ltrim($sort, '-');
        $sorts = [
            'created_at' => 'agencies.created_at',
            'name' => 'agencies.name',
            'members_count' => 'members_count',
            // Le nom PUBLIC du tri ne change pas — c'est un contrat d'API ; seule la
            // colonne visée est désormais désignée sans ambiguïté.
            'properties_count' => 'live_properties_count',
        ];

        if (isset($sorts[$field])) {
            $query->orderBy($sorts[$field], $direction);
        } else {
            $query->orderByDesc('agencies.created_at');
        }

        $perPage = (int) ($request->query('per_page') ?? 15);
        $agencies = $query->paginate($perPage > 0 ? min($perPage, 100) : 15);

        return $this->paginated($agencies, AgencyResource::collection($agencies)->resolve($request));
    }

    private function memberCountSubquery(): string
    {
        return <<<'SQL'
            select count(*) from (
                select owner_profiles.user_id
                from owner_profiles
                where owner_profiles.agency_id = agencies.id
                    and owner_profiles.deleted_at is null
                    and owner_profiles.status = 'active'
                union
                select agent_profiles.user_id
                from agent_profiles
                where agent_profiles.agency_id = agencies.id
                    and agent_profiles.deleted_at is null
                    and agent_profiles.status = 'active'
                union
                select service_provider_profiles.user_id
                from service_provider_profiles
                inner join service_provider_agency_collaborations
                    on service_provider_agency_collaborations.service_provider_profile_id = service_provider_profiles.id
                where service_provider_agency_collaborations.agency_id = agencies.id
                    and service_provider_agency_collaborations.deleted_at is null
                    and service_provider_agency_collaborations.status = 'active'
                    and service_provider_profiles.deleted_at is null
            ) as agency_member_users
        SQL;
    }

    private function lastActivitySubquery(): string
    {
        return <<<'SQL'
            select max(last_at) from (
                select agencies.updated_at as last_at
                union all
                select max(properties.updated_at)
                from properties
                where properties.agency_id = agencies.id
                    and properties.deleted_at is null
                union all
                select max(owner_profiles.updated_at)
                from owner_profiles
                where owner_profiles.agency_id = agencies.id
                    and owner_profiles.deleted_at is null
                union all
                select max(agent_profiles.updated_at)
                from agent_profiles
                where agent_profiles.agency_id = agencies.id
                    and agent_profiles.deleted_at is null
            ) as agency_activity
        SQL;
    }

    public function verify(Request $request, Agency $agency): JsonResponse
    {
        $this->refuseSuspended($agency);
        abort_code_unless(
            $agency->kycDossier?->status === KycDossierStatus::Verified,
            422,
            'agency.kyc_not_verified',
        );

        return $this->transition($request, $agency, AgencyStatus::Active, 'super_admin_agency_verified', [
            'is_verified' => true,
            'verified_at' => now(),
        ]);
    }

    public function suspend(SuspendAgencyRequest $request, Agency $agency): JsonResponse
    {
        $reason = (string) $request->validated('reason');
        $response = $this->transition($request, $agency, AgencyStatus::Suspended, 'super_admin_agency_suspended', [], $reason);
        $this->notifyAdmins($agency, NotificationCode::AgencySuspended, $reason);

        return $response;
    }

    /** TCK-600 (ADR-0048 §6) — la seule sortie de `suspended` qui ne touche pas à la vérification. */
    public function reinstate(ReinstateAgencyRequest $request, Agency $agency): JsonResponse
    {
        abort_code_unless($agency->status === AgencyStatus::Suspended, 422, 'agency.not_suspended');

        $reason = (string) $request->validated('reason');
        $response = $this->transition($request, $agency, AgencyStatus::Active, 'super_admin_agency_reinstated', [], $reason);
        $this->notifyAdmins($agency, NotificationCode::AgencyReinstated, $reason);

        return $response;
    }

    public function unverify(Request $request, Agency $agency): JsonResponse
    {
        $this->refuseSuspended($agency);

        return $this->transition($request, $agency, AgencyStatus::Inactive, 'super_admin_agency_unverified', [
            'is_verified' => false,
            'verified_at' => null,
        ]);
    }

    /**
     * TCK-600 (ADR-0048 §6) — `reinstate` est la SEULE sortie de `suspended`. `verify` (vers
     * `active`) et `unverify` (vers `inactive`, qui lève le verrou d'écriture) en étaient deux
     * autres, sans motif ni avis aux admins : chacune levait la sanction en silence.
     */
    private function refuseSuspended(Agency $agency): void
    {
        abort_code_if($agency->status === AgencyStatus::Suspended, 422, 'agency.reinstate_first');
    }

    private function transition(
        Request $request,
        Agency $agency,
        AgencyStatus $next,
        string $event,
        array $extra = [],
        ?string $reason = null,
    ): JsonResponse {
        $previous = $agency->status?->value;
        $agency->fill(['status' => $next] + $extra)->save();

        activity('Agency')
            ->performedOn($agency)
            ->causedBy($request->user())
            ->withProperties(array_filter(
                ['old_status' => $previous, 'new_status' => $next->value, 'reason' => $reason],
                fn ($value) => $value !== null,
            ))
            ->event($event)
            ->log("Agency {$event}");

        return $this->json([
            'data' => (new AgencyResource($agency->refresh()))->resolve($request),
        ]);
    }

    private function notifyAdmins(Agency $agency, NotificationCode $code, string $reason): void
    {
        foreach (app(ContactLeadService::class)->agencyAdmins($agency->id) as $admin) {
            app(NotificationService::class)->send($admin, $code, [
                'agency' => (string) $agency->name,
                'reason' => $reason,
            ]);
        }
    }
}
