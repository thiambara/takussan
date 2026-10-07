<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\AssignContactLeadRequest;
use App\Http\Requests\Api\ConvertContactLeadRequest;
use App\Http\Requests\Api\HandleContactLeadRequest;
use App\Http\Resources\PropertyContactLeadResource;
use App\Models\Enums\ContactLeadChannel;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Policies\PropertyContactLeadPolicy;
use App\Services\Lead\ContactLeadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-590 — la boîte « Demandes » de la console.
 *
 * Les demandes de contact étaient ENREGISTRÉES et ILLISIBLES : `PropertyContactLead::create`
 * avait deux appelants, aucune route ne les relisait, et `handled_at` n'était jamais écrit.
 *
 * La lecture suit `PropertyContactLeadPolicy` : le destinataire lit les siennes ; le personnel de
 * l'agence titulaire de `crm.view_all` lit toute la boîte de l'agence. Les clics WhatsApp /
 * Appeler ne sont pas dans la file : `filter[channel]` vaut `form` par défaut.
 */
class ContactLeadController extends Controller
{
    public function __construct(private readonly ContactLeadService $leads) {}

    public function index(Request $request, PropertyContactLeadPolicy $policy): JsonResponse
    {
        $user = $request->user();
        $base = PropertyContactLead::query();

        if (! $user->isSuperAdmin()) {
            $agencyId = $policy->agencyScopeFor($user);

            $base->where(function ($q) use ($user, $agencyId, $policy) {
                $q->where(fn ($d) => $policy->scopeDestinataire($d, $user));
                if ($agencyId !== null) {
                    $q->orWhere('agency_id', $agencyId);
                }
            });
        }

        $paginator = PropertyContactLead::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->paginated($paginator, PropertyContactLeadResource::collection($paginator)->toArray($request));
    }

    public function show(Request $request, PropertyContactLead $lead): JsonResponse
    {
        $this->authorize('view', $lead);

        return $this->json([
            'data' => PropertyContactLeadResource::make($lead->load(['property', 'recipient']))->toArray($request),
        ]);
    }

    public function handle(HandleContactLeadRequest $request, PropertyContactLead $lead): JsonResponse
    {
        $lead = $this->leads->markHandled($lead, $request->user());

        return $this->json(['data' => PropertyContactLeadResource::make($lead)->toArray($request)]);
    }

    public function assign(AssignContactLeadRequest $request, PropertyContactLead $lead): JsonResponse
    {
        $assignee = User::query()->findOrFail((int) $request->validated('user_id'));

        $lead = $this->leads->assign($lead, $assignee);

        return $this->json(['data' => PropertyContactLeadResource::make($lead)->toArray($request)]);
    }

    public function convert(ConvertContactLeadRequest $request, PropertyContactLead $lead): JsonResponse
    {
        abort_unless($lead->channel === ContactLeadChannel::Form, 422, __('leads.not_convertible'));

        $customer = $this->leads->convert($lead, $request->user());

        return $this->json([
            'data' => PropertyContactLeadResource::make($lead->refresh())->toArray($request),
            'customer' => ['id' => $customer->id],
        ], 201);
    }
}
