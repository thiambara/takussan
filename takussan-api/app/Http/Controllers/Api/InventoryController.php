<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\DisputeInventoryRequest;
use App\Http\Requests\Api\UploadRoomPhotosInventoryRequest;
use App\Http\Requests\InventorySignRequest;
use App\Http\Requests\InventoryStoreRequest;
use App\Http\Requests\InventoryUpdateRequest;
use App\Http\Resources\InventoryResource;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Inventory\InventorySignatureService;
use App\Services\Media\PdfImageEmbedder;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Model\InventoryService;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class InventoryController extends Controller
{
    public function __construct(
        protected InventoryService $inventories,
        protected InventorySignatureService $signatures,
        protected DocumentPdfService $pdf,
        protected PdfImageEmbedder $embedder,
        protected PrivateMediaAccess $privateMedia,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = Inventory::query()->with(['lease', 'property']);

        if (! $user->isSuperAdmin()) {
            $base->where(function ($q) use ($user) {
                $q->where('conducted_by', $user->id)
                    ->orWhereHas('property', function ($pq) use ($user) {
                        $pq->where('user_id', $user->id);
                    })
                    ->orWhereHas('tenant', function ($tq) use ($user) {
                        $tq->where('user_id', $user->id);
                    });

                // TCK-587 — le périmètre d'agence est celui du PERSONNEL (ADR-0031) : un bailleur de l'agence
                // listait les ressources de tous les autres.
                if (($staffAgencyId = $user->staffAgencyId()) !== null) {
                    $q->orWhereHas('property', function ($pq) use ($staffAgencyId) {
                        $pq->where('agency_id', $staffAgencyId);
                    });
                }
            });
        }

        $paginator = Inventory::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->paginated($paginator, InventoryResource::collection($paginator)->toArray($request));
    }

    public function indexForProperty(Request $request, Property $property): JsonResponse
    {
        $this->authorize('view', $property);

        $base = Inventory::query()->where('property_id', $property->id);

        $paginator = Inventory::buildQuery($base, $request)
            ->defaultSort('-conducted_at')
            ->paginate();

        return $this->paginated($paginator, InventoryResource::collection($paginator)->toArray($request));
    }

    public function store(InventoryStoreRequest $request): JsonResponse
    {
        $data = $request->validated();

        $lease = Lease::findOrFail($data['lease_id']);
        $user = $request->user();

        $this->authorize('update', $lease);

        $inventory = $this->inventories->create($lease, $user, $data);

        return $this->json([
            'data' => InventoryResource::make($inventory)->toArray($request),
        ], 201);
    }

    public function show(Request $request, Inventory $inventory): JsonResponse
    {
        $this->authorize('view', $inventory);

        // TCK-596 — `room_photos` (URL signées, par pièce) et `can_sign_as` ne sortent qu'ici,
        // jamais dans `index` : une URL signée par ligne de liste n'a pas de lecteur.
        $inventory->load(['lease.tenant', 'property', 'media']);

        return $this->json([
            'data' => InventoryResource::make($inventory)
                ->forViewer($request->user(), $this->signatures)
                ->toArray($request),
        ]);
    }

    public function update(InventoryUpdateRequest $request, Inventory $inventory): JsonResponse
    {
        $this->authorize('update', $inventory);

        // TCK-076 AC5 — once signed, an inventory is immutable: PATCH returns
        // 409 with a clear message. Other non-draft states (pending_signature,
        // disputed) keep the historical 422 response from TCK-031.
        if ($inventory->status === InventoryStatus::Signed) {
            abort_code(
                SymfonyResponse::HTTP_CONFLICT,
                'inventory.signed_locked'
            );
        }

        // Status guard runs BEFORE validation so non-draft inventories fail
        // with a clear 422 "only draft" message instead of generic validation errors.
        abort_code_unless(
            $inventory->status === InventoryStatus::Draft,
            422,
            'inventory.not_draft'
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
        $this->authorize('update', $inventory);
        $inventory = $this->inventories->submit($inventory);

        return $this->json([
            'data' => InventoryResource::make($inventory)->toArray($request),
        ]);
    }

    /**
     * TCK-596 — toujours avec un tracé : `role` et `signature` sont requis (422 sinon). La branche
     * sans charge utile, qui marquait signé sans tracé ni empreinte et, pour un super-admin, les deux
     * parties d'un coup, a disparu avec `InventoryService::sign`.
     */
    public function sign(InventorySignRequest $request, Inventory $inventory): JsonResponse
    {
        $data = $request->validated();

        $inventory = $this->signatures->sign(
            $inventory,
            $request->user(),
            $data['role'],
            $data['signature'],
        );

        return $this->json([
            'data' => InventoryResource::make($inventory)->toArray($request),
        ]);
    }

    public function downloadPdf(Request $request, Inventory $inventory): SymfonyResponse
    {
        $this->authorize('view', $inventory);

        abort_code_unless(
            $inventory->signed_at !== null
                || ($inventory->tenant_signed && $inventory->owner_signed),
            SymfonyResponse::HTTP_CONFLICT,
            'inventory.pdf_unsigned'
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
            'owner_signed_on_behalf' => $this->ownerSignedOnBehalf($inventory),
            'filename' => $filename,
        ]);
    }

    /**
     * TCK-596 — « Signé par X pour le compte de Y » quand un membre du personnel a signé au titre du
     * mandat. `null` quand le bailleur a signé lui-même, ou pour un état des lieux antérieur.
     */
    protected function ownerSignedOnBehalf(Inventory $inventory): ?string
    {
        if ($inventory->owner_signed_on_behalf_of_user_id === null || $inventory->owner_signed_by_user_id === null) {
            return null;
        }

        $signer = User::query()->find($inventory->owner_signed_by_user_id);
        $landlord = User::query()->find($inventory->owner_signed_on_behalf_of_user_id);

        return __('inventories.pdf.signed_on_behalf_of', [
            'signer' => $signer?->getFullNameAttribute() ?? '—',
            'landlord' => $landlord?->getFullNameAttribute() ?? '—',
        ]);
    }

    /**
     * Les photos par pièce, en URI `data:` — jamais par URL : `room_photos` est une collection
     * PRIVÉE (TCK-538), que rien ne sert à dompdf. Une photo illisible est omise plutôt que de
     * faire échouer le PDF signé.
     *
     * @return array<string, array<int, string>>
     */
    protected function groupRoomPhotos(Inventory $inventory): array
    {
        $grouped = [];
        foreach ($inventory->getMedia('room_photos') as $media) {
            $dataUri = $this->embedder->dataUri($media);
            if ($dataUri === null) {
                continue;
            }

            $room = (string) ($media->getCustomProperty('room_name') ?? 'Autres');
            $grouped[$room] ??= [];
            $grouped[$room][] = $dataUri;
        }

        return $grouped;
    }

    public function dispute(DisputeInventoryRequest $request, Inventory $inventory): JsonResponse
    {

        $data = $request->validated();

        $inventory = $this->inventories->dispute($inventory, $data['reason']);

        return $this->json([
            'data' => InventoryResource::make($inventory)->toArray($request),
        ]);
    }

    public function uploadRoomPhotos(UploadRoomPhotosInventoryRequest $request, Inventory $inventory): JsonResponse
    {
        // TCK-596 — même garde que `update`, AVANT toute écriture : le PDF d'un état des lieux est
        // recomposé au téléchargement, une photo ajoutée après signature changerait le document signé.
        $this->assertDraft($inventory);

        foreach ($request->file('photos') as $photo) {
            $inventory->addMedia($photo)
                ->withCustomProperties(['room_name' => $request->input('room_name')])
                ->toMediaCollection('room_photos');
        }

        return $this->json([
            'data' => $inventory->getMedia('room_photos')->map(fn ($m) => [
                'id' => $m->id,
                // URL d'API signée (TCK-538) : la collection est privée, `getUrl()` ne serait
                // servie par personne. La réponse est déjà autorisée (`update` sur l'inventaire).
                'url' => $this->privateMedia->signedUrl($m),
                'room_name' => $m->getCustomProperty('room_name'),
            ]),
        ]);
    }

    /**
     * TCK-596 — retire une photo de pièce, en brouillon seulement. Le média doit appartenir à CET
     * état des lieux et à la collection `room_photos` : sinon 404, sans dire s'il existe ailleurs.
     */
    public function destroyRoomPhoto(Request $request, Inventory $inventory, int $media): Response
    {
        $this->authorize('update', $inventory);

        $photo = $inventory->media()
            ->where('collection_name', 'room_photos')
            ->whereKey($media)
            ->firstOrFail();

        $this->assertDraft($inventory);

        $photo->delete();

        return response()->noContent();
    }

    /** 409 si l'état des lieux est signé, 422 s'il n'est plus un brouillon — la garde d'`update`. */
    private function assertDraft(Inventory $inventory): void
    {
        if ($inventory->status === InventoryStatus::Signed) {
            abort_code(SymfonyResponse::HTTP_CONFLICT, 'inventory.signed_locked');
        }

        abort_code_unless($inventory->status === InventoryStatus::Draft, 422, 'inventory.not_draft');
    }
}
