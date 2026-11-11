<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\BulkAssignPropertyVisitsRequest;
use App\Http\Requests\Api\BulkConfirmPropertyVisitsRequest;
use App\Http\Requests\Api\CancelPropertyVisitRequest;
use App\Http\Requests\Api\ClaimPropertyVisitRequest;
use App\Http\Requests\Api\CompletePropertyVisitRequest;
use App\Http\Requests\Api\ConfirmPropertyVisitRequest;
use App\Http\Requests\Api\FeedbackPropertyVisitRequest;
use App\Http\Requests\Api\ReschedulePropertyVisitRequest;
use App\Http\Requests\Api\StorePropertyVisitReportRequest;
use App\Http\Requests\Api\StorePropertyVisitRequest;
use App\Http\Requests\Api\UpdatePropertyVisitRequest;
use App\Http\Requests\Api\VisitSlotsRequest;
use App\Http\Resources\PropertyVisitResource;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Policies\PropertyVisitPolicy;
use App\Rules\PersonnelDeLAgence;
use App\Services\Crm\ContactGestureService;
use App\Services\Lead\ContactLeadService;
use App\Services\Media\WatermarkRequirement;
use App\Services\Notifications\ContactSansCompte;
use App\Services\Property\PrimaryPropertyContact;
use App\Services\Visit\VisitNotifier;
use App\Services\Visit\VisitReadContext;
use App\Services\Visit\VisitReportService;
use App\Services\Visit\VisitSchedulingService;
use App\Support\TelephoneSaisi;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class PropertyVisitController extends Controller
{
    public function __construct(
        protected VisitSchedulingService $scheduling,
        protected VisitNotifier $notifier,
        // TCK-2582 — la visite qui naît d'une demande la convertit ou la rattache.
        protected ContactLeadService $leads,
    ) {}

    /**
     * TCK-590 — la clause est celle de `PropertyVisitPolicy::view` : visiteur, agent assigné,
     * client lié, créateur du bien, **personnel de l'agence du bien**. Elle omettait ce dernier :
     * une même visite avait deux périmètres, et le collègue qui gère le bien ne la voyait pas dans
     * la liste alors que le calendrier et `show` la lui ouvraient.
     */
    public function index(Request $request): JsonResponse
    {
        $base = $this->indexScope($request);

        $paginator = PropertyVisit::buildQuery($base, $request)
            ->defaultSort('-scheduled_at')
            ->paginate();

        // Passe 3 (M7′) — l'agence de chaque bien de la page, en une requête : la ressource en
        // décide si la fiche client est rendue, sans relire le bien ligne par ligne.
        $request->attributes->set('visits.property_agencies', Property::query()
            ->whereIn('id', $paginator->getCollection()->pluck('property_id')->filter()->unique())
            ->pluck('agency_id', 'id')
            ->map(fn ($id) => $id === null ? null : (int) $id)
            ->all());

        $this->primePage($request, $paginator->getCollection());

        return $this->paginated($paginator, PropertyVisitResource::collection($paginator)->toArray($request));
    }

    /**
     * TCK-2585 — ce que la ressource lit pour toute la page, en un nombre de requêtes qui ne dépend
     * pas de sa taille : le contexte relu de chaque visite (`VisitReadContext`), et, sous
     * `include=property`, l'adresse, les photos et le verdict de filigrane des biens.
     *
     * @param  iterable<PropertyVisit>  $visits
     */
    private function primePage(Request $request, iterable $visits): void
    {
        $visits = collect($visits);
        VisitReadContext::prime($request, $visits);

        $properties = new EloquentCollection($visits
            ->filter(fn (PropertyVisit $v) => $v->relationLoaded('property') && $v->property !== null)
            ->map(fn (PropertyVisit $v) => $v->property)
            ->unique(fn (Property $p) => $p->getKey())
            ->values()
            ->all());
        if ($properties->isEmpty()) {
            return;
        }

        $properties->loadMissing(['address', 'media']);
        WatermarkRequirement::attach($properties);
    }

    /**
     * TCK-590 — la portée de l'index, partagée par `counts` (TCK-2585) : un compte d'onglet ne voit
     * que ce que la liste rendrait.
     *
     * @return Builder<PropertyVisit>
     */
    private function indexScope(Request $request): Builder
    {
        $user = $request->user();
        $base = PropertyVisit::query();

        if (! $user->isSuperAdmin()) {
            // Vérification adverse (M7) — le créateur d'un bien d'agence n'en est le propriétaire
            // que s'il y est bailleur actif (`PrimaryPropertyContact::estProprietaire`).
            $bailleurDe = PersonnelDeLAgence::agencesOuBailleur($user);
            // Passe 3 (M7′) — l'agent assigné ne lit la visite d'un bien d'agence que tant qu'il
            // est du personnel de cette agence : parti ou suspendu, il la perd, comme dans `view`.
            // Passe 4 (X1) — le compte doit être joignable ; passe 5 (X1′) — et l'agence est celle
            // du profil actif (ADR-0031 §1) : `agencesOuPersonnelActif`, au plus une.
            $personnelDe = PersonnelDeLAgence::agencesOuPersonnelActif($user);
            $request->attributes->set('visits.staff_agencies', $personnelDe);
            // P217.05 (TCK-2237) — sur un bien SANS agence, le créateur n'est propriétaire que
            // joignable, comme dans `view` (`PrimaryPropertyContact::estProprietaire`).
            $proprietaireSansAgence = PrimaryPropertyContact::joignable($user);

            $base->where(function ($q) use ($user, $bailleurDe, $personnelDe, $proprietaireSansAgence) {
                $q->where('visitor_id', $user->id)
                    ->orWhere(fn ($a) => $a->where('agent_id', $user->id)
                        ->whereHas('property', fn ($p) => $p->whereNull('agency_id')->orWhereIn('agency_id', $personnelDe)))
                    ->orWhereHas('property', fn ($p) => $p->where('user_id', $user->id)
                        ->where(fn ($a) => $a->when($proprietaireSansAgence, fn ($s) => $s->whereNull('agency_id'))
                            ->orWhereIn('agency_id', $bailleurDe)))
                    ->orWhereHas('customer', fn ($c) => $c->where('user_id', $user->id));

                if ($personnelDe !== []) {
                    $q->orWhereHas('property', fn ($p) => $p->whereIn('agency_id', $personnelDe));
                }
            });
        }

        return $base;
    }

    public function show(Request $request, PropertyVisit $visit): JsonResponse
    {
        $this->authorize('view', $visit);

        // TCK-2585 — l'adresse et la photo du bien (`PropertyVisitResource`).
        return $this->json([
            'data' => PropertyVisitResource::make($visit->load(['property.address', 'property.media', 'agent', 'visitor', 'customer']))->resolve($request),
        ]);
    }

    /**
     * GET /api/property-visits/counts — TCK-2585. Les comptes des onglets de la console, en UNE
     * requête, sous la portée de l'index (`indexScope`) et ses filtres (`filter[...]`, `mine=1` en
     * raccourci de `filter[mine]=1`). Chaque onglet est la borne que le front pose sur la liste
     * (`onglet-des-visites.ts`, `bornesDeLOnglet`), à l'instant de la requête :
     *
     *   · `unassigned` — en attente, sans agent, à venir ; `requested` — en attente, à venir ;
     *   · `confirmed` — confirmée, à venir ; `past` — heure passée, tout statut ;
     *   · `cancelled` — annulée ; `today` — tout statut, ce jour à Dakar (`filter[day]`) ;
     *   · `to_close` — `PropertyVisit::scopeToClose` (`filter[to_close]`), pour le seul personnel de
     *     l'agence du bien (`closableBound`, TCK-2587) ;
     *   · `later` — confirmée, à partir du lendemain à Dakar (`filter[status]=confirmed` +
     *     `filter[scheduled_at_min]`, TCK-2587) ; `all` — toute la portée, sans borne.
     */
    public function counts(Request $request): JsonResponse
    {
        $filters = $request->query('filter');
        $filters = is_array($filters) ? $filters : [];
        if (filter_var($request->query('mine'), FILTER_VALIDATE_BOOLEAN)) {
            $filters['mine'] = '1';
        }

        // Les seuls filtres : ni tri, ni champs, ni inclusions — un compte ne les lit pas.
        $scoped = PropertyVisit::buildQuery(
            $this->indexScope($request),
            Request::create($request->path(), 'GET', $filters === [] ? [] : ['filter' => $filters]),
        )->getEloquentBuilder();

        $now = CarbonImmutable::now();
        $day = $now->setTimezone(VisitSchedulingService::TIMEZONE)->startOfDay();
        $reportFrom = $now->subDays(max(0, (int) config('visits.report_pending_days', 7)));
        $scheduled = VisitStatus::Scheduled->value;
        $confirmed = VisitStatus::Confirmed->value;
        $completed = VisitStatus::Completed->value;
        $closable = $this->closableBound($request->user());

        $tabs = [
            'unassigned' => ['status = ? and agent_id is null and scheduled_at >= ?', [$scheduled, $now]],
            'requested' => ['status = ? and scheduled_at >= ?', [$scheduled, $now]],
            'confirmed' => ['status = ? and scheduled_at >= ?', [$confirmed, $now]],
            'past' => ['scheduled_at <= ?', [$now]],
            'cancelled' => ['status = ?', [VisitStatus::Cancelled->value]],
            'today' => ['scheduled_at >= ? and scheduled_at < ?', [$day->utc(), $day->addDay()->utc()]],
            'to_close' => [
                '((status = ? and scheduled_at <= ?) or (status = ? and reported_at is null and completed_at >= ?)) and '.$closable[0],
                [$confirmed, $now, $completed, $reportFrom, ...$closable[1]],
            ],
            // TCK-2587 — « Plus tard » : confirmée, à partir de demain à Dakar ; « Toutes » : la portée.
            'later' => ['status = ? and scheduled_at >= ?', [$confirmed, $day->addDay()->utc()]],
            'all' => ['true', []],
        ];

        $select = [];
        $bindings = [];
        foreach ($tabs as $tab => [$sql, $values]) {
            $select[] = 'count(*) filter (where '.$sql.') as "'.$tab.'"';
            foreach ($values as $value) {
                $bindings[] = $value instanceof CarbonImmutable ? $value->utc()->format('Y-m-d H:i:s') : $value;
            }
        }

        $row = (array) $scoped->toBase()->selectRaw(implode(', ', $select), $bindings)->first();

        return $this->json([
            'data' => array_map(fn (string $tab) => (int) ($row[$tab] ?? 0), array_combine(array_keys($tabs), array_keys($tabs))),
        ]);
    }

    /**
     * TCK-2587 — la borne d'« À clore » en SQL, celle du filtre `filter[to_close]` : une visite n'est à
     * clore que pour qui peut la clore (`PropertyVisitPolicy::report`), le personnel actif de l'agence
     * du bien, ou le super-admin. Le client, le bailleur et le prestataire comptent 0.
     *
     * @return array{0: string, 1: list<int>}
     */
    private function closableBound(User $user): array
    {
        if ($user->isSuperAdmin()) {
            return ['true', []];
        }
        $staff = PersonnelDeLAgence::agencesOuPersonnelActif($user);
        if ($staff === []) {
            return ['false', []];
        }

        return [
            'exists (select 1 from properties where properties.id = property_visits.property_id and properties.deleted_at is null and properties.agency_id in ('
                .implode(', ', array_fill(0, count($staff), '?')).'))',
            $staff,
        ];
    }

    /**
     * GET /api/property-visits/slots — TCK-2585. Les créneaux d'une journée pour la console : le
     * moteur de la route publique (`VisitSchedulingService::availableSlots`), sur tout bien de
     * l'agence de l'appelant (publié ou non), pour l'agent donné ou, à défaut, l'appelant s'il est du
     * personnel. La grille aide ; elle ne contraint pas la planification (`StorePropertyVisitRequest`).
     */
    public function slots(VisitSlotsRequest $request): JsonResponse
    {
        $property = $request->property();
        $date = CarbonImmutable::createFromFormat('!Y-m-d', $request->validated('date'), VisitSchedulingService::TIMEZONE);

        $user = $request->user();
        $agentId = $request->validated('agent_id');
        $agent = $agentId !== null
            ? User::query()->find((int) $agentId)
            : (PersonnelDeLAgence::personnelActifDe($user, $property->agency_id) ? $user : null);

        return $this->json([
            'data' => [
                'date' => $date->format('Y-m-d'),
                'timezone' => VisitSchedulingService::TIMEZONE,
                'slots' => $this->scheduling->availableSlots($property, $date, $agent),
            ],
        ]);
    }

    /**
     * POST /api/property-visits/bulk-confirm — TCK-2585. Chaque ligne est le geste unitaire
     * (`confirm`) : `update` et `agitPourLeBien`, puis `confirmOrFail` sous le verrou de la ligne, puis
     * l'avis au visiteur. Le lot n'est PAS atomique : une ligne refusée rend son statut et son code,
     * ceux du geste unitaire pour le même cas (décision de la session, 2026-11-11 — testée par
     * parité), et n'arrête pas les autres. Aucune attribution implicite : l'agent reste celui de la
     * visite.
     */
    public function bulkConfirm(BulkConfirmPropertyVisitsRequest $request): JsonResponse
    {
        $user = $request->user();
        $rows = collect($request->validated('visits'));
        $visits = PropertyVisit::query()->with('property')->whereKey($rows->pluck('id')->map(fn ($id) => (int) $id)->all())->get()->keyBy('id');

        $results = $rows->map(function (array $row) use ($user, $visits) {
            $id = (int) $row['id'];

            return $this->bulkRow($id, function () use ($id, $row, $user, $visits) {
                $visit = $visits->get($id);
                // Les refus du geste unitaire, dans son ordre : liaison de route (404), puis
                // `ConfirmPropertyVisitRequest::authorize` (`update`, 403 `http.forbidden`), puis
                // `agitPourLeBien` (403 `visit.staff_only`) — décision de la session : même cas, même code.
                abort_code_if($visit === null, 404, 'http.not_found');
                abort_code_unless($user->can('update', $visit), 403, 'http.forbidden');
                abort_code_unless($this->agitPourLeBien($user, $visit), 403, 'visit.staff_only');

                $scheduledAt = $row['scheduled_at'] ?? null;
                $confirmed = $this->scheduling->confirmOrFail($visit, $scheduledAt !== null ? Carbon::parse($scheduledAt) : null);
                $confirmed->load('property', 'visitor');

                // L'avis part après la transaction de la ligne ; son échec ne défait pas la confirmation.
                try {
                    $sms = $this->notifier->confirmed($confirmed, $user);
                } catch (Throwable $e) {
                    Log::warning('visit.bulk_confirm.notify_failed', ['visit_id' => $id, 'error' => $e->getMessage()]);
                    $sms = false;
                }

                return $sms === null ? [] : ['sms_sent' => $sms];
            });
        })->values()->all();

        return $this->json($this->bulkPayload($results));
    }

    /**
     * POST /api/property-visits/bulk-assign — TCK-2585. Chaque ligne est l'attribution d'`update` :
     * personnel de l'agence du bien et `crm.assign` dans cette agence (`visit.reassign_forbidden`),
     * visite ni terminée ni annulée (`visit.closed`), agent du personnel de l'agence du bien
     * (`visit.agent_not_staff`). Non atomique, comme la confirmation en lot.
     */
    public function bulkAssign(BulkAssignPropertyVisitsRequest $request): JsonResponse
    {
        $user = $request->user();
        $agentId = (int) $request->validated('agent_id');
        $agent = User::query()->find($agentId);
        $ids = collect($request->validated('ids'))->map(fn ($id) => (int) $id);
        $visits = PropertyVisit::query()->with('property.agency')->whereKey($ids->all())->get()->keyBy('id');

        $results = $ids->map(fn (int $id) => $this->bulkRow($id, function () use ($id, $user, $visits, $agent) {
            $visit = $visits->get($id);
            abort_code_if($visit === null || ! $this->agitPourLeBien($user, $visit), 403, 'visit.staff_only');
            abort_code_unless($this->canAssign($user, $visit), 403, 'visit.reassign_forbidden');
            abort_code_if(in_array($visit->status, [VisitStatus::Completed, VisitStatus::Cancelled], true), 422, 'visit.closed');
            abort_code_unless(PersonnelDeLAgence::estPersonnel($agent, $visit->property?->agency_id), 422, 'visit.agent_not_staff');

            // TCK-2744 — l'attribution d'une visite confirmée ne met pas l'agent à deux endroits.
            $this->attribuer($visit, $agent->id);

            return [];
        }))->values()->all();

        return $this->json($this->bulkPayload($results));
    }

    /**
     * TCK-2744 — pose l'agent d'une visite (`bulk-assign`, `claim`). Sur une visite confirmée à heure
     * fixée, l'agent ne doit pas être déjà pris à cette heure ({@see VisitSchedulingService::assertAgentFree()}),
     * garde et écriture dans une transaction, sous le verrou de l'agent. Une visite en attente
     * n'occupe personne : le refus viendra à sa confirmation.
     */
    private function attribuer(PropertyVisit $visit, int $agentId): void
    {
        DB::transaction(function () use ($visit, $agentId): void {
            $this->relireSousVerrou($visit);
            if ($visit->status === VisitStatus::Confirmed && $visit->preferred_window === null) {
                $this->scheduling->assertAgentFree($visit, $agentId, $visit->scheduled_at, $visit->duration_minutes, lockForUpdate: true);
            }
            $visit->update(['agent_id' => $agentId]);
        });
    }

    /**
     * TCK-2744 — la ligne de la visite, verrouillée puis relue, PREMIER verrou de la transaction :
     * l'ordre des verrous est alors celui de `confirmOrFail` (la visite, les visites confirmées du
     * bien, puis l'agent). Verrouiller l'agent d'abord croisait une confirmation concurrente qui tient
     * déjà la visite (interblocage), et le statut se jugeait sur le modèle lu avant la transaction.
     */
    private function relireSousVerrou(PropertyVisit $visit): void
    {
        PropertyVisit::query()->whereKey($visit->getKey())->lockForUpdate()->first(['id']);
        $visit->refresh();
    }

    /**
     * Une ligne d'un lot : `{id, ok: true, …}`, ou `{id, ok: false, code, status}` du refus qu'aurait
     * rendu le geste unitaire. Seuls les refus codés de l'API se rendent ; toute autre erreur remonte.
     *
     * @param  \Closure(): array<string, mixed>  $gesture
     * @return array<string, mixed>
     */
    private function bulkRow(int $id, \Closure $gesture): array
    {
        try {
            return ['id' => $id, 'ok' => true] + $gesture();
        } catch (ApiError $e) {
            return ['id' => $id, 'ok' => false, 'code' => $e->errorCode, 'status' => $e->getStatusCode()];
        }
    }

    /**
     * @param  list<array<string, mixed>>  $results
     * @return array<string, mixed>
     */
    private function bulkPayload(array $results): array
    {
        $ok = count(array_filter($results, fn (array $r) => $r['ok']));

        return ['data' => $results, 'meta' => ['ok' => $ok, 'failed' => count($results) - $ok]];
    }

    /**
     * TCK-590 — deux gestes sous une même route.
     *
     *   · **Le personnel de l'agence du bien planifie pour un client** (le prospect qui a appelé) : le
     *     visiteur est l'utilisateur de la fiche client s'il en a un, sinon personne — la fiche et
     *     le nom + téléphone en tiennent lieu ; l'agent est l'appelant par défaut s'il est du
     *     personnel ; la visite naît CONFIRMÉE après le garde de chevauchement, et le visiteur est
     *     prévenu. L'API posait toujours `visitor_id = $user->id` : l'agent devenait le visiteur.
     *   · **Tout autre réserve pour lui-même**, sur un bien public : `customer_id`, `agent_id` et
     *     `visitor_*` sont DÉRIVÉS de lui (contrainte 3) — il ne choisit ni la fiche d'un autre,
     *     ni l'agent.
     *
     * Le « personnel » se juge sur l'agence DU BIEN (`PersonnelDeLAgence`) : `$user->agency_id`
     * rendait l'agence du profil actif quel qu'il soit, et un BAILLEUR de l'agence passait pour du
     * personnel — il réservait sur le bien non public d'un autre bailleur en gardant l'`agent_id`
     * qu'il envoyait.
     */
    public function store(StorePropertyVisitRequest $request): JsonResponse
    {
        $data = $request->validated();

        // TCK-1072 (P62.06) — un bien absent reçoit le refus d'un bien fermé aux visites.
        $property = $request->property();
        abort_code_if($property === null, 403, 'visit.property_unavailable');
        $user = $request->user();

        if ($request->managesProperty()) {
            return $this->planForCustomer($request, $property, $user, $data);
        }

        // Non-staff users can only book visits on publicly visible properties.
        $isPublic = Property::query()->where('id', $property->id)->public()->exists();
        abort_code_unless($isPublic, 403, 'visit.property_unavailable');

        $customerId = $property->agency_id !== null
            ? Customer::query()->where('user_id', $user->id)->where('agency_id', $property->agency_id)->value('id')
            : null;

        // TCK-075 — a visitor cannot stack more than N active visits per
        // property. Quota check + insert are wrapped in a transaction
        // with row-level locks to close the TOCTOU race between two
        // concurrent booking requests from the same visitor.
        $visit = $this->scheduling->createOrFail($property, $user, [
            'property_id' => $property->id,
            'visitor_id' => $user->id,
            'customer_id' => $customerId,
            'agent_id' => null,
            'visitor_name' => trim(($user->first_name ?? '').' '.($user->last_name ?? '')) ?: null,
            'visitor_email' => $user->email,
            'visitor_phone' => $user->phone,
            'scheduled_at' => $data['scheduled_at'],
            'duration_minutes' => $data['duration_minutes'] ?? null,
            'notes' => $data['notes'] ?? null,
            'source' => $data['source'] ?? null,
            'medium' => $data['medium'] ?? null,
            'locale' => app()->getLocale(),
            'type' => $data['type'] ?? VisitType::InPerson->value,
            'status' => VisitStatus::Scheduled->value,
        ]);

        // TCK-1410 — une demande rejouée au même créneau rend la visite déjà ouverte : déjà prévenue.
        if ($visit->wasRecentlyCreated) {
            $this->notifier->requested($visit->fresh(['property', 'agent']));
        }

        return $this->json([
            'data' => PropertyVisitResource::make($visit)->resolve($request),
        ], 201);
    }

    /**
     * TCK-2582 — la fiche de la visite qui naît d'une demande, relue sous le verrou de la demande
     * (par `convert` / `attach`) :
     *
     *   · la demande est déjà rattachée → sa fiche (ou celle donnée par `customer_id`) ;
     *   · `customer_id` donné → la demande la rejoint (rattachement, mêmes écritures qu'une
     *     conversion) ;
     *   · `create_customer` → la demande est convertie (`customer.duplicate` sauf
     *     `allow_duplicate`, comme `POST /contact-leads/{lead}/convert`) ;
     *   · sinon aucune fiche : le nom et le téléphone viennent de la demande
     *     (`StorePropertyVisitRequest::prepareForValidation`).
     */
    private function customerFromLead(PropertyContactLead $lead, ?Customer $customer, User $user, StorePropertyVisitRequest $request): ?Customer
    {
        $linked = PropertyContactLead::query()->whereKey($lead->id)->value('customer_id');
        if ($linked !== null) {
            return $customer ?? Customer::query()->find((int) $linked);
        }

        if ($customer !== null) {
            return $this->leads->attach($lead, $customer, $user);
        }

        if ($request->boolean('create_customer')) {
            // Les refus de la route `convert` (clic, doublon, déjà convertie) sont tenus par le service.
            return $this->leads->convert($lead, $user, $request->boolean('allow_duplicate'));
        }

        return null;
    }

    /**
     * @param  array<string,mixed>  $data
     */
    private function planForCustomer(StorePropertyVisitRequest $request, Property $property, User $user, array $data): JsonResponse
    {
        $agentId = array_key_exists('agent_id', $data) && $data['agent_id'] !== null
            ? (int) $data['agent_id']
            : (PersonnelDeLAgence::personnelActifDe($user, $property->agency_id) ? $user->id : null);

        // TCK-2582 — la visite qui naît d'une demande : conversion (ou rattachement), visite et
        // demande traitée dans UNE transaction — un chevauchement refusé (422) ne laisse pas une
        // demande convertie sans visite. Le SMS part après, hors transaction.
        $lead = $request->lead();
        $visit = DB::transaction(function () use ($property, $user, $data, $agentId, $lead, $request) {
            $customer = isset($data['customer_id']) ? Customer::query()->find($data['customer_id']) : null;
            if ($lead !== null) {
                $customer = $this->customerFromLead($lead, $customer, $user, $request);
            }

            $visitor = $customer?->user_id !== null ? User::query()->find($customer->user_id) : null;

            $visit = $this->scheduling->createConfirmedOrFail($property, $visitor, [
                'property_id' => $property->id,
                'visitor_id' => $visitor?->id,
                'customer_id' => $customer?->id,
                'agent_id' => $agentId,
                'visitor_name' => $data['visitor_name'] ?? ($customer !== null ? trim($customer->first_name.' '.$customer->last_name) : null),
                // Vérification adverse (M6) — `customers.phone` est saisi librement (TCK-591) : recopié
                // tel quel, « 77 123 45 67 » donnait un `visitor_phone` que le canal SMS jetait sans bruit.
                'visitor_phone' => $data['visitor_phone'] ?? TelephoneSaisi::normaliser($customer?->phone),
                'visitor_email' => $data['visitor_email'] ?? $customer?->email,
                'scheduled_at' => $data['scheduled_at'],
                'duration_minutes' => $data['duration_minutes'] ?? null,
                'notes' => $data['notes'] ?? null,
                // TCK-2582 — l'attribution de la demande, à défaut d'une attribution donnée.
                'source' => $data['source'] ?? $lead?->source,
                'medium' => $data['medium'] ?? $lead?->medium,
                'contact_lead_id' => $lead?->id,
                // P29.02 (TCK-845) — la langue négociée ici est celle de l'AGENT : un client sans compte
                // reçoit `fr`, comme ses relances de loyer (`ContactSansCompte::fromCustomer()`).
                'locale' => $visitor?->preferredLocale() ?? ContactSansCompte::DEFAULT_LOCALE,
                'type' => $data['type'] ?? VisitType::InPerson->value,
            ]);

            if ($lead !== null) {
                $this->leads->markHandled($lead->refresh(), $user);
            }

            return $visit;
        });

        $sms = $this->notifier->confirmed($visit->fresh(['property', 'visitor']), $user);

        return $this->json($this->avecSortDuSms([
            'data' => PropertyVisitResource::make($visit->refresh())->resolve($request),
        ], $sms), 201);
    }

    public function update(UpdatePropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {
        // Vérification adverse, passe 2 (b) — déplacer l'heure, c'est parler au visiteur au nom
        // de l'agence : sur un bien d'agence, le personnel seul (cf. `agitPourLeBien`).
        abort_code_unless($this->agitPourLeBien($request->user(), $visit), 403, 'visit.staff_only');

        abort_code_if(
            in_array($visit->status, [VisitStatus::Completed, VisitStatus::Cancelled], true),
            422,
            'visit.closed'
        );

        // `status` is intentionally NOT part of this validator: every
        // status transition must go through a dedicated endpoint
        // (/confirm, /complete, /cancel). Those endpoints enforce valid
        // source states AND set the paired timestamp columns
        // (completed_at, cancelled_at) plus the overlap/quota guards.
        // Allowing free-form PATCH on `status` would let clients jump
        // from scheduled → completed without populating `completed_at`,
        // which silently breaks the feedback-window lockout.
        $data = $request->validated();

        // TCK-1838 (P184.04) — déplacer l'heure suit la règle du report (`rescheduleOrFail`) :
        // hors statut actif (`no_show`…), plus rien ne confirme ni ne reporte la visite, et le
        // visiteur recevait l'annonce d'un rendez-vous mort. Notes, type et agent restent ouverts.
        if (array_key_exists('scheduled_at', $data)
            && ! Carbon::parse($data['scheduled_at'])->equalTo($visit->scheduled_at)) {
            abort_code_unless(
                in_array($visit->status, VisitSchedulingService::ACTIVE_STATUSES, true),
                422,
                'visit.reschedule_inactive',
            );
        }

        // TCK-590 (contrainte 2) — changer l'agent d'une visite DÉJÀ attribuée à un autre est un
        // geste d'attribution : il exige `crm.assign` dans l'agence du bien.
        if (array_key_exists('agent_id', $data)
            && $visit->agent_id !== null
            && ($data['agent_id'] === null || (int) $data['agent_id'] !== $visit->agent_id)) {
            abort_code_unless($this->canAssign($request->user(), $visit), 403, 'visit.reassign_forbidden');
        }

        $previous = $visit->scheduled_at;
        // TCK-2502 — une heure envoyée par l'agence fixe l'heure, même égale au début de tranche.
        if (array_key_exists('scheduled_at', $data)) {
            $data['preferred_window'] = null;
        }

        // TCK-2744 — les deux gardes d'une visite confirmée (le bien, puis l'agent) et l'écriture, dans
        // UNE transaction et sous verrou : la garde du bien courait ici sans verrou. Jugées sur les
        // valeurs RÉSULTANTES (nouvelle heure, nouvelle durée, nouvel agent) dès que l'écriture en
        // porte une : la visite elle-même est écartée, une durée repassée telle quelle passe.
        DB::transaction(function () use ($visit, $data): void {
            $this->relireSousVerrou($visit);
            $temps = array_key_exists('scheduled_at', $data) || array_key_exists('duration_minutes', $data);
            if ($visit->status === VisitStatus::Confirmed && ($temps || array_key_exists('agent_id', $data))) {
                $newStart = array_key_exists('scheduled_at', $data)
                    ? Carbon::parse($data['scheduled_at'])
                    : $visit->scheduled_at;
                $newDuration = array_key_exists('duration_minutes', $data)
                    ? $data['duration_minutes']
                    : $visit->duration_minutes;
                if ($temps) {
                    $this->scheduling->assertNoOverlap($visit, $newStart, $newDuration, lockForUpdate: true);
                }
                $newAgent = array_key_exists('agent_id', $data) ? $data['agent_id'] : $visit->agent_id;
                // Une visite confirmée à tranche (sans heure fixée) n'occupe personne, sauf si l'écriture fixe l'heure.
                $fixee = array_key_exists('scheduled_at', $data) || $visit->preferred_window === null;
                $this->scheduling->assertAgentFree(
                    $visit,
                    $newAgent !== null ? (int) $newAgent : null,
                    $fixee ? $newStart : null,
                    $newDuration !== null ? (int) $newDuration : null,
                    lockForUpdate: true,
                );
            }

            $visit->fill($data)->save();
        });

        // TCK-590 (contrainte 11) — tout déplacement d'heure par l'agence prévient le visiteur,
        // une fois. `update` déplaçait l'heure sans prévenir personne.
        $sms = null;
        if (array_key_exists('scheduled_at', $data) && ! $visit->scheduled_at?->equalTo($previous)) {
            $sms = $this->notifier->rescheduledByAgency($visit->fresh(['property', 'visitor']), $request->user());
        }

        return $this->json($this->avecSortDuSms(['data' => PropertyVisitResource::make($visit->refresh())->resolve($request)], $sms));
    }

    /**
     * TCK-590 — « Prendre en charge » : l'appelant, personnel de l'agence du bien
     * (`ClaimPropertyVisitRequest`), devient l'agent de la visite. Reprendre une visite déjà
     * attribuée à un AUTRE est un 409, sauf pour qui détient `crm.assign`.
     */
    public function claim(ClaimPropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {
        $user = $request->user();

        abort_code_if(
            in_array($visit->status, [VisitStatus::Completed, VisitStatus::Cancelled], true),
            422,
            'visit.closed',
        );

        if ($visit->agent_id !== null && $visit->agent_id !== $user->id && ! $this->canAssign($user, $visit)) {
            abort_code(409, 'visit.already_assigned');
        }

        // TCK-2744 — prendre en charge une visite confirmée, c'est s'y engager à son heure.
        $this->attribuer($visit, $user->id);

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->resolve($request)]);
    }

    /**
     * TCK-590 — le visiteur propose un autre créneau : nouvelle heure, la visite repasse en
     * attente de confirmation, l'agence est prévenue.
     */
    public function reschedule(ReschedulePropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {
        $visit = $this->scheduling->rescheduleOrFail($visit, Carbon::parse($request->validated('scheduled_at')));

        $this->notifier->rescheduledByVisitor($visit->fresh(['property', 'agent']));

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->resolve($request)]);
    }

    public function confirm(ConfirmPropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {
        $this->authorize('update', $visit);
        // Vérification adverse, passe 3 (B2″) — confirmer, c'est le geste qui fait partir le SMS au
        // visiteur (contrainte 4) : la même garde que `update` et `cancel`. Sur un bien d'agence,
        // le bailleur, l'agent parti et l'agent suspendu encore assigné confirmaient (200 + SMS).
        abort_code_unless($this->agitPourLeBien($request->user(), $visit), 403, 'visit.staff_only');

        // TCK-075 AC2 — source-state check, overlap guard and status
        // flip happen inside a single DB transaction with row-level
        // locks so two concurrent confirm calls cannot both pass the
        // overlap check and both win.
        // TCK-2502 — l'heure fixée en confirmant ; exigée pour une visite demandée par tranche.
        $scheduledAt = $request->validated('scheduled_at');
        $visit = $this->scheduling->confirmOrFail($visit, $scheduledAt !== null ? Carbon::parse($scheduledAt) : null);
        $visit->load('property', 'visitor');

        $sms = $this->notifier->confirmed($visit, $request->user());

        return $this->json($this->avecSortDuSms(['data' => PropertyVisitResource::make($visit)->resolve($request)], $sms));
    }

    public function complete(CompletePropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {
        // Passe 3 (B2″, M7′) — clore la visite est un geste de l'agence, comme la confirmer.
        abort_code_unless($this->agitPourLeBien($request->user(), $visit), 403, 'visit.staff_only');

        abort_code_unless(
            in_array($visit->status, [VisitStatus::Scheduled, VisitStatus::Confirmed], true),
            422,
            'visit.cannot_complete'
        );

        $data = $request->validated();

        $visit->update(array_merge($data, [
            'status' => VisitStatus::Completed,
            'completed_at' => now(),
        ]));

        // TCK-2583 — une visite menée est un contact : le dernier contact de la fiche avance.
        if ($visit->customer_id !== null) {
            app(ContactGestureService::class)->touchCustomer((int) $visit->customer_id, $visit->completed_at);
        }

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->resolve($request)]);
    }

    /**
     * TCK-1375 (P115.05, décision du porteur) — le geste « absent » : le visiteur n'est pas venu.
     * Rien n'écrivait `no_show` ; l'agent devait déclarer la visite terminée (comptée parmi les
     * visites menées, ouverte à l'avis du visiteur) ou l'annuler. Geste de l'agence, comme
     * `complete`, depuis `scheduled` ou `confirmed`, une fois l'heure de la visite passée. Pas de
     * passage automatique : une visite simplement non clôturée n'est pas une absence.
     */
    public function noShow(Request $request, PropertyVisit $visit): JsonResponse
    {
        $this->authorize('update', $visit);
        abort_code_unless($this->agitPourLeBien($request->user(), $visit), 403, 'visit.staff_only');

        abort_code_unless(
            in_array($visit->status, [VisitStatus::Scheduled, VisitStatus::Confirmed], true)
                && $visit->scheduled_at !== null
                && $visit->scheduled_at->lessThanOrEqualTo(now()),
            422,
            'visit.cannot_mark_no_show'
        );

        $visit->update(['status' => VisitStatus::NoShow]);

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->resolve($request)]);
    }

    public function cancel(CancelPropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {
        // TCK-590 — `cancel` ne prévenait personne. Le visiteur qui annule prévient l'agence ;
        // l'agence qui annule prévient le visiteur. Vérification adverse, passe 2 (b) : quiconque
        // n'est pas le visiteur annule AU NOM DE L'AGENCE, et doit donc agir pour le bien.
        $user = $request->user();
        $byVisitor = $visit->visitor_id === $user->id
            || ($visit->customer !== null && $visit->customer->user_id === $user->id);
        abort_code_unless($byVisitor || $this->agitPourLeBien($user, $visit), 403, 'visit.staff_only');

        // P182.06 (TCK-1820) — le statut se juge sur la ligne relue sous verrou, pas sur le modèle
        // lié à la route ; l'avis part après la transaction.
        $visit = $this->scheduling->cancelOrFail($visit, $request->validated('reason'));

        $fresh = $visit->fresh(['property', 'visitor', 'agent']);
        $sms = null;
        if ($byVisitor) {
            $this->notifier->cancelledByVisitor($fresh);
        } else {
            $sms = $this->notifier->cancelledByAgency($fresh, $user);
        }

        return $this->json($this->avecSortDuSms(['data' => PropertyVisitResource::make($visit->refresh())->resolve($request)], $sms));
    }

    /**
     * DELETE /api/property-visits/{visit}: mirrors {@see cancel} so clients
     * that prefer REST verbs can cancel with a single call.
     */
    public function destroy(CancelPropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {
        // TCK-305 — `destroy` reçoit le MÊME FormRequest que `cancel` : c'est la même action,
        // sous un autre verbe. Lui laisser un `Request` nu produisait un TypeError à l'appel
        // interne — le typage a signalé ce que le miroir de routes cachait.
        return $this->cancel($request, $visit);
    }

    /**
     * POST /api/property-visits/{visit}/feedback — TCK-075.
     *
     * Two roles can post feedback: the visiting `customer` (matched by
     * `visitor_id` or `customer.user_id`) and the managing `agent` (owner,
     * assigned agent or same-agency admin). Feedback is unlocked only
     * after `completed` and stays open for N hours (configurable),
     * giving both parties time to reflect without letting feedback
     * trickle in weeks later.
     */
    public function feedback(FeedbackPropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {

        abort_code_unless(
            $visit->status === VisitStatus::Completed,
            422,
            'visit.feedback_not_completed'
        );

        $completedAt = $visit->completed_at;
        $windowHours = (int) config('visits.feedback_window_hours', 24);
        abort_code_if(
            $completedAt === null || $completedAt->diffInHours(now()) > $windowHours,
            422,
            'visit.feedback_window_closed'
        );

        $data = $request->validated();

        $user = $request->user();
        $role = $data['role'];
        $property = $visit->property;

        $isCustomer = $visit->visitor_id === $user->id
            || ($visit->customer && $visit->customer->user_id === $user->id);
        // TCK-590 — le personnel de l'agence DU BIEN, plus « l'agence du profil actif » : un
        // bailleur de l'agence déposait l'avis « agent » sur les visites des biens d'un autre.
        $isAgent = $user->isSuperAdmin()
            || $visit->agent_id === $user->id
            || ($property && PrimaryPropertyContact::estProprietaire($user, $property))
            || ($property && PersonnelDeLAgence::personnelActifDe($user, $property->agency_id));

        if ($role === 'customer') {
            abort_code_unless($isCustomer, 403, 'visit.feedback_visitor_only');
        } else {
            abort_code_unless($isAgent, 403, 'visit.feedback_agent_only');
        }

        $metadata = $visit->metadata ?? [];
        $metadata['feedback_'.$role] = [
            'user_id' => $user->id,
            'rating' => isset($data['rating']) ? (float) $data['rating'] : null,
            'comment' => $data['comment'] ?? null,
            'submitted_at' => $this->instant(now()),
        ];

        // Surface the customer's feedback/rating on the visit's top-level
        // columns so the existing Resource keeps working; the agent's
        // feedback stays in metadata (there's no dedicated column yet).
        $payload = ['metadata' => $metadata];
        if ($role === 'customer') {
            if (array_key_exists('comment', $data)) {
                $payload['feedback'] = $data['comment'];
            }
            if (array_key_exists('rating', $data)) {
                $payload['rating'] = $data['rating'];
            }
        }

        $visit->update($payload);

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->resolve($request)]);
    }

    /**
     * POST|PATCH /api/property-visits/{visit}/report — TCK-2578 (ADR-0101).
     *
     * Le compte rendu de l'agence : `POST` le crée (201), `PATCH` le modifie (200, champs absents
     * gardés). Sous `PropertyVisitPolicy::report` (`StorePropertyVisitReportRequest::authorize`).
     * La réponse porte la visite, la note recopiée sur la fiche (`customer_note`, `null` sans
     * fiche) et l'étape proposée (`suggested_stage`, jamais écrite).
     */
    public function report(StorePropertyVisitReportRequest $request, PropertyVisit $visit, VisitReportService $reports): JsonResponse
    {
        $creating = $request->isMethod('POST');
        $result = $reports->write($visit, $request->user(), $request->validated(), $creating);

        $note = $result['note'];

        return $this->json([
            'data' => PropertyVisitResource::make($result['visit']->fresh(['reportedBy']))->resolve($request),
            'customer_note' => $note !== null ? [
                'id' => $note->id,
                'customer_id' => $note->customer_id,
                'kind' => $note->kind?->value,
                'pinned' => $note->pinned,
            ] : null,
            'suggested_stage' => $result['suggested_stage'],
        ], $creating ? 201 : 200);
    }

    /**
     * Passe 3 (R1) — le sort du SMS au visiteur, dit à l'appelant : `sms_sent` quand un SMS était
     * prévu ; s'il a été retenu par une borne, un code et son libellé. Le front affiche le sien
     * pour le code (`visits.smsWithheld`). ⚠ `sms_sent: true` veut dire « non retenu, mis en
     * file », pas « parti » (P179.04, TCK-1799) : le transport se joue au worker. Le front ne lit
     * que `false`.
     *
     * @param  array<string,mixed>  $payload
     * @return array<string,mixed>
     */
    private function avecSortDuSms(array $payload, ?bool $sms): array
    {
        if ($sms === null) {
            return $payload;
        }

        $payload['sms_sent'] = $sms;
        if ($sms === false) {
            $payload['sms_code'] = VisitNotifier::CODE_SMS_RETENU;
            $payload['sms_message'] = __('visits.sms_withheld');
        }

        return $payload;
    }

    /** P152.04 — la règle vit dans {@see PropertyVisitPolicy::agitPourLeBien}, que la ressource lit aussi. */
    private function agitPourLeBien(User $user, PropertyVisit $visit): bool
    {
        return PropertyVisitPolicy::agitPourLeBien($user, $visit);
    }

    /** `crm.assign` dans l'agence du bien de la visite. */
    private function canAssign(User $user, PropertyVisit $visit): bool
    {
        $agency = $visit->property?->agency;

        return $user->isSuperAdmin()
            || ($agency !== null && $user->canActAt(Capability::CrmAssign, $agency));
    }
}
