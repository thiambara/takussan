<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\CompleteMaintenanceRequestRequest;
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
use App\Notifications\UrgentMaintenanceCreatedNotification;
use App\Services\Model\MaintenanceRequestService;
use App\Services\Model\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;

class MaintenanceRequestController extends Controller
{
    public function __construct(
        protected NotificationService $notifications,
        protected MaintenanceRequestService $service,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = MaintenanceRequest::query();
        if (! $user->isSuperAdmin()) {
            $base->where(function ($q) use ($user) {
                $q->where('requester_id', $user->id)
                    ->orWhere('assigned_to', $user->id)
                    ->orWhereHas('property', fn ($p) => $p->where('user_id', $user->id));
                if ($user->agency_id) {
                    $q->orWhereHas('property', fn ($p) => $p->where('agency_id', $user->agency_id));
                }
            });
        }

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

        $base = MaintenanceRequest::query()->where('property_id', $property->id);

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

        $isStaff = $user->isSuperAdmin()
            || $property->user_id === $user->id
            || ($user->agency_id && $user->agency_id === $property->agency_id);
        $isActiveTenant = $property->leases()
            ->where('status', LeaseStatus::Active)
            ->whereHas('tenant', fn ($q) => $q->where('user_id', $user->id))
            ->exists();
        abort_unless($isStaff || $isActiveTenant, 403);

        if (! $isStaff) {
            unset($data['assigned_to']);
        }

        $mr = MaintenanceRequest::create(array_merge($data, [
            'requester_id' => $user->id,
            'status' => MaintenanceStatus::Open->value,
            'priority' => $data['priority'] ?? MaintenancePriority::Normal->value,
        ]));

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
            $this->notifications->notify(
                $owner,
                NotificationType::Maintenance,
                'Nouvelle demande de maintenance',
                'Une demande de maintenance a été soumise pour '.$property->title.'.',
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

        $data = $request->validated();

        $maintenanceRequest->fill($data)->save();

        return $this->json([
            'data' => MaintenanceRequestResource::make($maintenanceRequest->refresh())->toArray($request),
        ]);
    }

    public function updateStatus(UpdateStatusMaintenanceRequestRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {

        $data = $request->validated();

        $target = MaintenanceStatus::from($data['status']);
        $maintenanceRequest = $this->service->transition($maintenanceRequest, $target);

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
            abort(422, 'Provide either `cost` or `actual_cost`, not both.');
        }

        $photos = $request->file('photos', []) ?? [];
        $maintenanceRequest = $this->service->complete($maintenanceRequest, $data, is_array($photos) ? $photos : []);

        return $this->json([
            'data' => MaintenanceRequestResource::make($maintenanceRequest)->toArray($request),
        ]);
    }

    public function uploadPhotos(UploadPhotosMaintenanceRequestRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {

        // Block uploads on terminal states — a closed or cancelled request
        // should not accept new photos (prevents abuse and keeps the audit
        // log on media consistent with the work actually performed).
        if (in_array($maintenanceRequest->status, [MaintenanceStatus::Closed, MaintenanceStatus::Cancelled], true)) {
            abort(422, 'Cannot upload photos to a closed or cancelled maintenance request.');
        }

        $data = $request->validated();

        $collection = $data['collection'] ?? 'photos';

        // Only managers can attach completion_photos.
        if ($collection === 'completion_photos') {
            $this->authorize('update', $maintenanceRequest);
        }

        $added = $this->service->addPhotos($maintenanceRequest, $request->file('photos', []), $collection);

        return $this->json(['data' => $added], 201);
    }
}
