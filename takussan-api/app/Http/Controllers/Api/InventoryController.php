<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\InventorySignRequest;
use App\Http\Requests\InventoryStoreRequest;
use App\Http\Requests\InventoryUpdateRequest;
use App\Http\Resources\InventoryResource;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Services\Inventory\InventorySignatureService;
use App\Services\Model\InventoryService;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class InventoryController extends Controller
{
    public function __construct(
        protected InventoryService $inventories,
        protected InventorySignatureService $signatures,
        protected DocumentPdfService $pdf,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = Inventory::query()->with(['lease', 'property']);

        if (! $user->hasRole('super_admin')) {
            $base->where(function ($q) use ($user) {
                $q->where('conducted_by', $user->id)
                    ->orWhereHas('property', function ($pq) use ($user) {
                        $pq->where('user_id', $user->id);
                    })
                    ->orWhereHas('tenant', function ($tq) use ($user) {
                        $tq->where('user_id', $user->id);
                    });

                if ($user->agency_id) {
                    $q->orWhereHas('property', function ($pq) use ($user) {
                        $pq->where('agency_id', $user->agency_id);
                    });
                }
            });
        }

        $paginator = Inventory::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->json([
            'data' => InventoryResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function indexForProperty(Request $request, Property $property): JsonResponse
    {
        $this->authorizePropertyAccess($request, $property);

        $base = Inventory::query()->where('property_id', $property->id);

        $paginator = Inventory::buildQuery($base, $request)
            ->defaultSort('-conducted_at')
            ->paginate();

        return $this->json([
            'data' => InventoryResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function store(InventoryStoreRequest $request): JsonResponse
    {
        $data = $request->validated();

        $lease = Lease::findOrFail($data['lease_id']);
        $user = $request->user();

        $this->authorizeManageLease($user, $lease);

        $inventory = $this->inventories->create($lease, $user, $data);

        return $this->json([
            'data' => InventoryResource::make($inventory)->toArray($request),
        ], 201);
    }

    public function show(Request $request, Inventory $inventory): JsonResponse
    {
        $this->authorizeAccess($request, $inventory);

        return $this->json([
            'data' => InventoryResource::make($inventory->load(['lease', 'property']))->toArray($request),
        ]);
    }

    public function update(InventoryUpdateRequest $request, Inventory $inventory): JsonResponse
    {
        $this->authorizeManage($request, $inventory);

        // TCK-076 AC5 — once signed, an inventory is immutable: PATCH returns
        // 409 with a clear message. Other non-draft states (pending_signature,
        // disputed) keep the historical 422 response from TCK-031.
        if ($inventory->status === InventoryStatus::Signed) {
            abort(
                SymfonyResponse::HTTP_CONFLICT,
                'Signed inventories are immutable.'
            );
        }

        // Status guard runs BEFORE validation so non-draft inventories fail
        // with a clear 422 "only draft" message instead of generic validation errors.
        abort_unless(
            $inventory->status === InventoryStatus::Draft,
            422,
            'Only draft inventories can be edited.'
        );

        $data = $request->validated();

        $presentKeys = [];
        foreach (array_keys($data) as $key) {
            if ($request->has($key)) {
                $presentKeys[$key] = true;
            }
        }

        $inventory = $this->inventories->update($inventory, $data, $presentKeys);

        return $this->json([
            'data' => InventoryResource::make($inventory)->toArray($request),
        ]);
    }

    public function submit(Request $request, Inventory $inventory): JsonResponse
    {
        $this->authorizeManage($request, $inventory);
        $inventory = $this->inventories->submit($inventory);

        return $this->json([
            'data' => InventoryResource::make($inventory)->toArray($request),
        ]);
    }

    public function sign(Request $request, Inventory $inventory): JsonResponse
    {
        // TCK-076 — explicit role + signature payload. We still support the
        // legacy payload-less call (used by TCK-031 tests): when no `role`
        // is provided, fall back to the historical InventoryService::sign
        // that infers the role from the caller identity (no signature data
        // stored, only the boolean + timestamp).
        if ($request->has('role') || $request->has('signature')) {
            $signRequest = InventorySignRequest::createFrom($request);
            $signRequest->setContainer(app())->setRedirector(app('redirect'));
            $signRequest->validateResolved();
            $data = $signRequest->validated();

            $inventory = $this->signatures->sign(
                $inventory,
                $request->user(),
                $data['role'],
                $data['signature'],
            );
        } else {
            $inventory = $this->inventories->sign($inventory, $request->user());
        }

        return $this->json([
            'data' => InventoryResource::make($inventory)->toArray($request),
        ]);
    }

    public function downloadPdf(Request $request, Inventory $inventory): SymfonyResponse
    {
        $this->authorizeAccess($request, $inventory);

        abort_unless(
            $inventory->signed_at !== null
                || ($inventory->tenant_signed && $inventory->owner_signed),
            SymfonyResponse::HTTP_CONFLICT,
            'Inventory PDF is available only once both parties have signed.'
        );

        $inventory->loadMissing(['lease', 'property.address', 'tenant']);
        // Make signature payloads temporarily visible so the Blade template
        // can embed them as <img src="data:..."> without leaking through any
        // JSON resource.
        $inventory->makeVisible(['tenant_signature_data', 'owner_signature_data']);

        $property = $inventory->property;
        $landlord = $property?->user;
        $agency = $property?->agency;

        $roomPhotos = $this->groupRoomPhotos($inventory);

        $filename = sprintf('etat-des-lieux-%d.pdf', $inventory->id);

        return $this->pdf->stream('pdf.inventories.report', [
            'title' => 'État des lieux #'.$inventory->id,
            'document_label' => 'État des lieux',
            'inventory' => $inventory,
            'lease' => $inventory->lease,
            'property' => $property,
            'tenant' => $inventory->tenant,
            'landlord' => $landlord,
            'agency' => $agency,
            'room_photos' => $roomPhotos,
            'tenant_signature' => $inventory->tenant_signature_data,
            'owner_signature' => $inventory->owner_signature_data,
            'traceability_hash' => $this->signatures->traceabilityHash($inventory),
            'filename' => $filename,
        ]);
    }

    /**
     * @return array<string, array<int, string>>
     */
    protected function groupRoomPhotos(Inventory $inventory): array
    {
        $grouped = [];
        foreach ($inventory->getMedia('room_photos') as $media) {
            $room = (string) ($media->getCustomProperty('room_name') ?? 'Autres');
            $grouped[$room] ??= [];
            $grouped[$room][] = $media->getUrl();
        }

        return $grouped;
    }

    public function dispute(Request $request, Inventory $inventory): JsonResponse
    {
        $this->authorizeAccess($request, $inventory);

        $data = $request->validate([
            'reason' => ['required', 'string'],
        ]);

        $inventory = $this->inventories->dispute($inventory, $data['reason']);

        return $this->json([
            'data' => InventoryResource::make($inventory)->toArray($request),
        ]);
    }

    public function uploadRoomPhotos(Request $request, Inventory $inventory): JsonResponse
    {
        $this->authorizeManage($request, $inventory);

        $request->validate([
            'photos' => ['required', 'array', 'min:1'],
            'photos.*' => ['required', 'image', 'max:5120'],
            'room_name' => ['required', 'string'],
        ]);

        foreach ($request->file('photos') as $photo) {
            $inventory->addMedia($photo)
                ->withCustomProperties(['room_name' => $request->input('room_name')])
                ->toMediaCollection('room_photos');
        }

        return $this->json([
            'data' => $inventory->getMedia('room_photos')->map(fn ($m) => [
                'id' => $m->id,
                'url' => $m->getUrl(),
                'room_name' => $m->getCustomProperty('room_name'),
            ]),
        ]);
    }

    protected function authorizeManageLease($user, Lease $lease): void
    {
        $ok = $user->hasRole('super_admin')
            || $lease->landlord_id === $user->id
            || ($user->agency_id && $lease->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }

    protected function authorizeAccess(Request $request, Inventory $inventory): void
    {
        $user = $request->user();
        $property = $inventory->property;
        $tenant = $inventory->tenant;

        $ok = $user->hasRole('super_admin')
            || $inventory->conducted_by === $user->id
            || ($property && $property->user_id === $user->id)
            || ($tenant && $tenant->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }

    protected function authorizeManage(Request $request, Inventory $inventory): void
    {
        $user = $request->user();
        $property = $inventory->property;

        $ok = $user->hasRole('super_admin')
            || $inventory->conducted_by === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }

    protected function authorizePropertyAccess(Request $request, Property $property): void
    {
        $user = $request->user();

        $ok = $user->hasRole('super_admin')
            || $property->user_id === $user->id
            || ($user->agency_id && $property->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }
}
