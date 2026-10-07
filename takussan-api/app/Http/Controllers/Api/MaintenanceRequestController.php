<?php

namespace App\Http\Controllers\Api;

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
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\NotificationType;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use App\Policies\MaintenanceRequestPolicy;
use App\Services\Maintenance\MaintenanceStateMachine;
use App\Services\Model\MaintenanceRequestService;
use App\Services\Model\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
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

        return $this->paginated($paginator, MaintenanceRequestResource::collection($paginator)->toArray($request));
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
        $property = Property::findOrFail($data['property_id']);

        // TCK-445 — UNE seule définition du côté donneur d'ordre, partagée avec `update()`
        // (via l'ability `actAsPrincipal`). Elle était recopiée ici, et nulle part côté
        // `update()` : c'est cette asymétrie qui a laissé un prestataire assigné se
        // réassigner sa propre demande.
        $isStaff = MaintenanceRequestPolicy::isPrincipalFor($user, $property);
        $isActiveTenant = $property->leases()
            ->where('status', LeaseStatus::Active)
            ->whereHas('tenant', fn ($q) => $q->where('user_id', $user->id))
            ->exists();
        abort_unless($isStaff || $isActiveTenant, 403);

        $assigneeId = $isStaff ? ($data['assigned_to'] ?? null) : null;
        unset($data['assigned_to']);

        $mr = MaintenanceRequest::create(array_merge($data, [
            'requester_id' => $user->id,
            'status' => MaintenanceStatus::Open->value,
            'priority' => $data['priority'] ?? MaintenancePriority::Normal->value,
        ]));

        // TCK-592 — une assignation à la création emprunte le chemin de toutes les autres :
        // `accepted_at` nul, événement émis (notification, fil de l'intervention).
        if ($assigneeId !== null) {
            $mr = $this->service->assign($mr, User::query()->findOrFail($assigneeId), $user);
        }

        // Notify agency agents and property owner
        $property = $property->refresh();
        $owner = $property->owner;

        if ($mr->priority === MaintenancePriority::Urgent) {
            $assignedAgent = $mr->assignee;
            $manager = $property->agency?->primaryAdmin;

            $notifiables = collect([$assignedAgent, $manager])->filter()->unique('id');

            if ($notifiables->isNotEmpty()) {
                Notification::send($notifiables, new UrgentMaintenanceCreatedNotification($mr));
            }
        }

        if ($owner && $owner->id !== $user->id) {
            // TCK-592 — clé de traduction rendue dans la langue du DESTINATAIRE, pas de l'auteur.
            $locale = $owner->preferredLocale();
            $params = ['title' => $mr->title, 'property' => $property->title];
            $this->notifications->notify(
                $owner,
                NotificationType::Maintenance,
                __('maintenance.notifications.created.title', $params, $locale),
                __('maintenance.notifications.created.body', $params, $locale),
                ['maintenance_request_id' => $mr->id],
            );
        }

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ], 201);
    }

    public function show(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorize('view', $maintenanceRequest);

        $includes = collect(explode(',', (string) $request->query('include')))
            ->map(fn (string $include) => trim($include))
            ->filter()
            ->intersect(['property', 'requester', 'assignee', 'quoteDecisionBy'])
            ->values();

        if ($includes->contains('property')) {
            $maintenanceRequest->loadMissing('property.address');
        }

        $maintenanceRequest->loadMissing(
            $includes
                ->reject(fn (string $include) => $include === 'property')
                ->all()
        );

        return $this->json([
            'data' => MaintenanceRequestResource::make($maintenanceRequest)->toArray($request),
        ]);
    }

    public function update(UpdateMaintenanceRequestRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {

        $data = Arr::except($request->validated(), UpdateMaintenanceRequestRequest::STATE_FIELDS);

        // TCK-592 — l'assignation a son chemin (`accepted_at` remis à nul, événement) : elle ne passe
        // pas par `fill()`.
        $assignmentChanged = array_key_exists('assigned_to', $data);
        $assigneeId = $data['assigned_to'] ?? null;
        unset($data['assigned_to']);

        $maintenanceRequest->fill($data)->save();

        if ($assignmentChanged) {
            $this->service->assign(
                $maintenanceRequest,
                $assigneeId !== null ? User::query()->findOrFail($assigneeId) : null,
                $request->user(),
            );
        }

        return $this->json([
            'data' => MaintenanceRequestResource::make($maintenanceRequest->refresh())->toArray($request),
        ]);
    }

    public function updateStatus(UpdateStatusMaintenanceRequestRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {

        $data = $request->validated();

        $target = MaintenanceStatus::from($data['status']);
        $current = $maintenanceRequest->status ?? MaintenanceStatus::Open;

        // TCK-592 — les cibles de devis, et la contestation, ont leur endpoint : il porte ce que le
        // générique ignorerait (montant, validité, plafond du bailleur, commentaire).
        abort_unless(
            $current === $target || $this->machine->isGeneric($current, $target),
            422,
            __('maintenance.errors.dedicated_endpoint'),
        );

        $maintenanceRequest = $this->service->transition($maintenanceRequest, $target, $request->user());

        return $this->json([
            'data' => MaintenanceRequestResource::make($maintenanceRequest)->toArray($request),
        ]);
    }

    public function complete(CompleteMaintenanceRequestRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {

        $data = $request->validated();

        // Reject ambiguous payloads rather than silently preferring one field.
        if (array_key_exists('cost', $data) && array_key_exists('actual_cost', $data)
            && $data['cost'] !== null && $data['actual_cost'] !== null) {
            abort(422, __('maintenance.errors.cost_ambiguous'));
        }

        $photos = $request->file('photos', []) ?? [];
        $maintenanceRequest = $this->service->complete($maintenanceRequest, $data, is_array($photos) ? $photos : [], $request->user());

        return $this->json([
            'data' => MaintenanceRequestResource::make($maintenanceRequest)->toArray($request),
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

        return $this->json(['data' => MaintenanceRequestResource::make($mr)->toArray($request)]);
    }

    /**
     * TCK-592 — refuser avant d'avoir accepté : la demande revient au donneur d'ordre avec le motif.
     */
    public function decline(DeclineMaintenanceRequestRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $mr = $this->service->decline($maintenanceRequest, $request->user(), $request->validated('reason'));

        return $this->json(['data' => MaintenanceRequestResource::make($mr)->toArray($request)]);
    }

    /**
     * TCK-592 (P10) — le demandeur confirme : la réparation est reconnue, la demande close.
     */
    public function confirmResolution(ConfirmMaintenanceResolutionRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $mr = $this->service->confirmResolution($maintenanceRequest, $request->user());

        return $this->json(['data' => MaintenanceRequestResource::make($mr)->toArray($request)]);
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

        return $this->json(['data' => MaintenanceRequestResource::make($mr)->toArray($request)]);
    }

    public function uploadPhotos(UploadPhotosMaintenanceRequestRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {

        // Block uploads on terminal states — a closed or cancelled request
        // should not accept new photos (prevents abuse and keeps the audit
        // log on media consistent with the work actually performed).
        if (in_array($maintenanceRequest->status, [MaintenanceStatus::Closed, MaintenanceStatus::Cancelled], true)) {
            abort(422, __('maintenance.errors.terminal_request'));
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
            abort_if($maintenanceRequest->accepted_at === null, 422, __('maintenance.errors.before_photos_requires_acceptance'));
        }

        $added = $this->service->addPhotos($maintenanceRequest, $request->file('photos', []), $collection);

        return $this->json(['data' => $added], 201);
    }
}
