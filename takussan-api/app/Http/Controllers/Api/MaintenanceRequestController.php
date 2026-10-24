<?php

namespace App\Http\Controllers\Api;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Events\Maintenance\MaintenanceScheduleChanged;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\CompleteMaintenanceRequestRequest;
use App\Http\Requests\Api\ConfirmMaintenanceResolutionRequest;
use App\Http\Requests\Api\ContestMaintenanceResolutionRequest;
use App\Http\Requests\Api\DeclineMaintenanceRequestRequest;
use App\Http\Requests\Api\StoreMaintenanceRequestRequest;
use App\Http\Requests\Api\UpdateMaintenanceRequestRequest;
use App\Http\Requests\Api\UpdateStatusMaintenanceRequestRequest;
use App\Http\Requests\Api\UploadPhotosMaintenanceRequestRequest;
use App\Http\Resources\MaintenanceRequestResource;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use App\Policies\MaintenanceRequestPolicy;
use App\Services\Maintenance\CurrencyUnit;
use App\Services\Maintenance\MaintenanceStateMachine;
use App\Services\Maintenance\OwnerApprovalThreshold;
use App\Services\Model\MaintenanceRequestService;
use App\Services\Model\NotificationService;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

class MaintenanceRequestController extends Controller
{
    public function __construct(
        protected NotificationService $notifications,
        protected MaintenanceRequestService $service,
        protected MaintenanceStateMachine $machine,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // TCK-592 — un seul périmètre, celui de la policy `view` : {@see MaintenanceRequest::scopeVisibleTo()}.
        $base = MaintenanceRequest::query()->visibleTo($user);

        // TCK-281 — `defaultSortsWithRelevance()` doit être évalué APRÈS
        // `buildQuery()`, qui est ce qui interroge Meilisearch.
        $query = MaintenanceRequest::buildQuery($base, $request);

        $paginator = $query
            ->defaultSorts(...MaintenanceRequest::defaultSortsWithRelevance('-priority', '-created_at'))
            ->paginate();

        // TCK-592 (P17) — « Mes interventions » montre le quartier et l'agence : comme `show()`, le
        // bien inclus vient avec son adresse, et ici avec l'agence (le front demande `agency_id`).
        // P216.03 (TCK-2124) — `include[]=…` vaut un `include` absent (TCK-1407, TCK-1866), et n'est plus casté.
        $include = $request->query('include');
        if (is_string($include) && in_array('property', explode(',', $include), true)) {
            $paginator->getCollection()->loadMissing(['property.address', 'property.agency:id,name']);
        }

        return $this->paginated(
            $paginator,
            MaintenanceRequestResource::collection($paginator)->toArray($request),
            ['abilities' => ['can_create' => $user->can('openRequests', MaintenanceRequest::class)]],
        );
    }

    public function indexForProperty(Request $request, Property $property): JsonResponse
    {
        $this->authorize('view', $property);

        // TCK-592 — lire le bien ne suffit pas : la liste reste bornée au périmètre de `view`.
        $base = MaintenanceRequest::query()->where('property_id', $property->id)->visibleTo($request->user());

        $query = MaintenanceRequest::buildQuery($base, $request);

        $paginator = $query
            ->defaultSorts(...MaintenanceRequest::defaultSortsWithRelevance('-priority', '-created_at'))
            ->paginate();

        return $this->paginated($paginator, MaintenanceRequestResource::collection($paginator)->toArray($request));
    }

    public function store(StoreMaintenanceRequestRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = $request->user();
        // TCK-1072 (P62.06) — un bien absent reçoit le refus d'un bien tiers.
        $property = Property::query()->find((int) $data['property_id']);
        abort_if($property === null, 403);

        // TCK-445 — UNE seule définition du côté donneur d'ordre, partagée avec `update()`
        // (via l'ability `actAsPrincipal`). Elle était recopiée ici, et nulle part côté
        // `update()` : c'est cette asymétrie qui a laissé un prestataire assigné se
        // réassigner sa propre demande.
        $isStaff = MaintenanceRequestPolicy::isPrincipalFor($user, $property);
        // TCK-1001 — un locataire en préavis (`terminating`) habite encore le logement : le
        // bail « en cours » se juge par la même liste que le rôle `tenant`.
        $isActiveTenant = $property->leases()
            ->whereIn('status', User::ACTIVE_TENANT_LEASE_STATUSES)
            ->whereHas('tenant', fn ($q) => $q->where('user_id', $user->id))
            ->exists();
        abort_unless($isStaff || $isActiveTenant, 403);

        // TCK-1070 (P62.04) — le bail rattaché se juge ici, avec la réponse du refus : un bail
        // absent et un bail que l'appelant ne voit pas reçoivent le même 403.
        if (isset($data['lease_id'])) {
            $lease = Lease::query()->find((int) $data['lease_id']);
            abort_unless($lease !== null && $user->can('view', $lease), 403);
        }

        $assigneeId = $isStaff ? ($data['assigned_to'] ?? null) : null;
        // TCK-2203 (P227.02) — assigner à la création est le geste que la modification juge par
        // `actAsPrincipal` : le personnel sans `maintenance.assign` reçoit le même 403.
        abort_if($assigneeId !== null && ! MaintenanceRequestPolicy::teamMayAssignOn($user, $property), 403);
        unset($data['assigned_to']);

        $mr = MaintenanceRequest::create(array_merge($data, [
            'requester_id' => $user->id,
            'status' => MaintenanceStatus::Open->value,
            'priority' => $data['priority'] ?? MaintenancePriority::Normal->value,
        ]));

        // TCK-1991 (P169.03) — l'escalade compte ses 30 minutes depuis le passage en urgent.
        if ($mr->priority === MaintenancePriority::Urgent) {
            $mr->metadata = [...($mr->metadata ?? []), MaintenanceRequest::URGENT_SINCE => $this->instant(now())];
            $mr->saveQuietly();
        }

        // TCK-592 — une assignation à la création emprunte le chemin de toutes les autres :
        // `accepted_at` nul, événement émis (notification, fil de l'intervention).
        if ($assigneeId !== null) {
            $mr = $this->service->assign($mr, User::query()->findOrFail($assigneeId), $user);
        }

        // Notify agency agents and property owner
        $property = $property->refresh();
        // TCK-1316 — le créateur du bien, s'il compte encore (bailleur ou personnel actif).
        $owner = PrimaryPropertyContact::createurDestinataire($property);

        if ($mr->priority === MaintenancePriority::Urgent) {
            $this->sendUrgentAlert($mr, $property);
        }

        if ($owner && $owner->id !== $user->id) {
            $this->notifications->send($owner, NotificationCode::MaintenanceCreated, [
                'property' => $property->title,
                'reference' => '#'.$mr->id,
            ], NotificationTarget::of('maintenance', $mr->id));
        }

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->resolve($request),
        ], 201);
    }

    public function show(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorize('view', $maintenanceRequest);

        // P216.03 (TCK-2124) — `include[]=…` vaut un `include` absent (TCK-1407, TCK-1866), et n'est plus casté.
        $include = $request->query('include');
        $includes = collect(is_string($include) ? explode(',', $include) : [])
            ->map(fn (string $include) => trim($include))
            ->filter()
            ->intersect(['property', 'requester', 'assignee', 'quoteDecisionBy'])
            ->values();

        if ($includes->contains('property')) {
            // TCK-592 — l'agence du bien : le bloc d'assignation lit son carnet.
            $maintenanceRequest->loadMissing(['property.address', 'property.agency:id,name']);
        }

        $maintenanceRequest->loadMissing(
            $includes
                ->reject(fn (string $include) => $include === 'property')
                ->all()
        );

        return $this->json([
            'data' => MaintenanceRequestResource::make($maintenanceRequest)->resolve($request),
        ]);
    }

    public function update(UpdateMaintenanceRequestRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        // TCK-592 (verif-592, M2) — une demande close ou annulée ne se modifie plus : le prestataire
        // réécrivait ses notes après la confirmation du locataire, le donneur d'ordre le coût.
        abort_code_if($this->machine->isTerminal($maintenanceRequest->status), 422, 'maintenance.terminal_request');

        $data = Arr::except($request->validated(), UpdateMaintenanceRequestRequest::STATE_FIELDS);

        // TCK-2010 (P184.02) — tout ou rien : `assign()` peut encore refuser (`completed`,
        // `maintenance.reassign_after_completion`) après que l'heure, la priorité et le coût réel
        // ont été écrits. La transaction rend la ligne intacte sur ce refus.
        $becameUrgent = false;
        DB::transaction(function () use ($request, $maintenanceRequest, $data, &$becameUrgent): void {
            // TCK-592 — l'assignation a son chemin (`accepted_at` remis à nul, événement) : elle ne passe
            // pas par `fill()`.
            // TCK-592 (verif-592, M1) — au-delà du plafond du bailleur, `actual_cost` est à son accord.
            if (($data['actual_cost'] ?? null) !== null) {
                // verif-592 passe 2 (N5) — arrondi à l'unité de la devise avant d'être comparé ou écrit.
                $data['actual_cost'] = CurrencyUnit::cost($maintenanceRequest, $data['actual_cost']);
                app(OwnerApprovalThreshold::class)->assertActualCostAgreed($maintenanceRequest, $data['actual_cost'], $request->user()->id);
                app(OwnerApprovalThreshold::class)->recordOwnerCost($maintenanceRequest, $data['actual_cost'], $request->user()->id);
            } elseif (array_key_exists('actual_cost', $data)) {
                // verif-592 passe 4 (N11) — un coût retiré n'est plus un accord du bailleur.
                app(OwnerApprovalThreshold::class)->forgetOwnerCost($maintenanceRequest);
            }

            $assignmentChanged = array_key_exists('assigned_to', $data);
            $assigneeId = $data['assigned_to'] ?? null;
            unset($data['assigned_to']);

            $wasUrgent = $maintenanceRequest->priority === MaintenancePriority::Urgent;
            $maintenanceRequest->fill($data);
            $isUrgent = $maintenanceRequest->priority === MaintenancePriority::Urgent;
            $becameUrgent = ! $wasUrgent && $isUrgent;

            // TCK-1991 (P169.03) — le passage en urgent est daté, et le retour à une autre priorité
            // efface cette date et l'escalade : une demande remise en urgent s'escalade de nouveau.
            if ($wasUrgent !== $isUrgent) {
                $metadata = $maintenanceRequest->metadata ?? [];
                unset($metadata[MaintenanceRequest::URGENT_SINCE], $metadata[MaintenanceRequest::ESCALATED_AT]);
                if ($becameUrgent) {
                    $metadata[MaintenanceRequest::URGENT_SINCE] = $this->instant(now());
                }
                $maintenanceRequest->metadata = $metadata;
            }

            // TCK-2012 (P184.01) — un passage fixé ou déplacé s'annonce ; la même heure renvoyée par
            // le bloc d'assignation (`isDirty` compare l'instant) ou une heure retirée, non.
            $scheduleChanged = $maintenanceRequest->isDirty('scheduled_at') && $maintenanceRequest->scheduled_at !== null;
            $maintenanceRequest->save();

            if ($assignmentChanged) {
                $this->service->assign(
                    $maintenanceRequest,
                    $assigneeId !== null ? User::query()->findOrFail($assigneeId) : null,
                    $request->user(),
                );
            }

            if ($scheduleChanged) {
                MaintenanceScheduleChanged::dispatch($maintenanceRequest, $request->user());
            }
        });

        // TCK-1991 (P169.03) — l'alerte d'urgence part au passage en urgent, pas seulement à la
        // création : sans elle, l'escalade arrivait la première, ou personne n'était prévenu.
        if ($becameUrgent) {
            $maintenanceRequest->refresh();
            $this->sendUrgentAlert($maintenanceRequest, $maintenanceRequest->property, becameUrgent: true);
        }

        return $this->json([
            'data' => MaintenanceRequestResource::make($maintenanceRequest->refresh())->resolve($request),
        ]);
    }

    /**
     * L'alerte d'urgence : l'assigné et l'admin principal de l'agence du bien.
     */
    private function sendUrgentAlert(MaintenanceRequest $mr, ?Property $property, bool $becameUrgent = false): void
    {
        $notifiables = collect([$mr->assignee, $property?->agency?->primaryAdmin])->filter()->unique('id');

        if ($notifiables->isNotEmpty()) {
            Notification::send($notifiables, new UrgentMaintenanceCreatedNotification($mr, becameUrgent: $becameUrgent));
        }
    }

    public function updateStatus(UpdateStatusMaintenanceRequestRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {

        $data = $request->validated();

        $target = MaintenanceStatus::from($data['status']);
        $current = $maintenanceRequest->status ?? MaintenanceStatus::Open;

        // TCK-592 — les cibles de devis, et la contestation, ont leur endpoint : il porte ce que le
        // générique ignorerait (montant, validité, plafond du bailleur, commentaire).
        abort_code_unless(
            $current === $target || $this->machine->isGeneric($current, $target),
            422,
            'maintenance.dedicated_endpoint',
        );

        $maintenanceRequest = $this->service->transition($maintenanceRequest, $target, $request->user());

        return $this->json([
            'data' => MaintenanceRequestResource::make($maintenanceRequest)->resolve($request),
        ]);
    }

    public function complete(CompleteMaintenanceRequestRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {

        $data = $request->validated();

        // Reject ambiguous payloads rather than silently preferring one field.
        if (array_key_exists('cost', $data) && array_key_exists('actual_cost', $data)
            && $data['cost'] !== null && $data['actual_cost'] !== null) {
            abort_code(422, 'maintenance.cost_ambiguous');
        }

        $photos = $request->file('photos', []) ?? [];
        $maintenanceRequest = $this->service->complete($maintenanceRequest, $data, is_array($photos) ? $photos : [], $request->user());

        return $this->json([
            'data' => MaintenanceRequestResource::make($maintenanceRequest)->resolve($request),
        ]);
    }

    /**
     * TCK-592 — le prestataire assigné accepte l'intervention : `accepted_at`. Le kit d'accès
     * (rue, coordonnées, téléphone du demandeur) ne s'ouvre qu'après.
     */
    public function accept(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorize('respondToAssignment', $maintenanceRequest);

        $mr = $this->service->accept($maintenanceRequest, $request->user());

        return $this->json(['data' => MaintenanceRequestResource::make($mr)->resolve($request)]);
    }

    /**
     * TCK-592 — refuser avant d'avoir accepté : la demande revient au donneur d'ordre avec le motif.
     */
    public function decline(DeclineMaintenanceRequestRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $mr = $this->service->decline($maintenanceRequest, $request->user(), $request->validated('reason'));

        return $this->json(['data' => MaintenanceRequestResource::make($mr)->resolve($request)]);
    }

    /**
     * TCK-592 (P10) — le demandeur confirme : la réparation est reconnue, la demande close.
     */
    public function confirmResolution(ConfirmMaintenanceResolutionRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $mr = $this->service->confirmResolution($maintenanceRequest, $request->user());

        return $this->json(['data' => MaintenanceRequestResource::make($mr)->resolve($request)]);
    }

    /**
     * TCK-592 (P10) — le demandeur conteste : retour `in_progress`, prestataire et donneurs d'ordre
     * prévenus avec le commentaire.
     */
    public function contestResolution(ContestMaintenanceResolutionRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $photos = $request->file('photos', []) ?? [];
        $mr = $this->service->contestResolution(
            $maintenanceRequest,
            $request->user(),
            $request->validated('comment'),
            is_array($photos) ? $photos : [],
        );

        return $this->json(['data' => MaintenanceRequestResource::make($mr)->resolve($request)]);
    }

    public function uploadPhotos(UploadPhotosMaintenanceRequestRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {

        // Block uploads on terminal states — a closed or cancelled request
        // should not accept new photos (prevents abuse and keeps the audit
        // log on media consistent with the work actually performed).
        if (in_array($maintenanceRequest->status, [MaintenanceStatus::Closed, MaintenanceStatus::Cancelled], true)) {
            abort_code(422, 'maintenance.photos_closed');
        }

        $data = $request->validated();

        $collection = $data['collection'] ?? 'photos';

        // Only managers can attach completion_photos.
        if ($collection === 'completion_photos') {
            $this->authorize('update', $maintenanceRequest);
        }

        // TCK-592 (P7) — les photos « avant » : le prestataire assigné, une fois l'intervention
        // acceptée. Avant acceptation, il n'est pas encore passé sur place.
        if ($collection === 'before_photos') {
            $this->authorize('actAsProvider', $maintenanceRequest);
            abort_code_if($maintenanceRequest->accepted_at === null, 422, 'maintenance.before_photos_requires_acceptance');
        }

        $added = $this->service->addPhotos($maintenanceRequest, $request->file('photos', []), $collection);

        return $this->json(['data' => $added], 201);
    }
}
