<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Base\Controller;
use App\Models\Customer;
use App\Models\Property;
use App\Services\Crm\ProspectMatcher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-591 §5 — le rapprochement prospect ↔ bien, dans les deux sens, borné à l'agence.
 */
class ProspectMatchController extends Controller
{
    private const MAX_PER_PAGE = 50;

    public function __construct(private readonly ProspectMatcher $matcher) {}

    /** Les biens de l'agence (privés compris) qui correspondent aux critères du prospect. */
    public function forCustomer(Request $request, Customer $customer): JsonResponse
    {
        $this->authorize('matchProperties', $customer);

        $paginator = $this->matcher->propertiesFor($customer)
            ->with('address:id,addressable_id,addressable_type,city,neighborhood')
            ->orderByDesc('properties.published_at')
            ->orderByDesc('properties.id')
            ->paginate($this->pageSize($request));

        return $this->paginated($paginator, $paginator->getCollection()->map(fn (Property $p) => [
            'id' => $p->id,
            'title' => $p->title,
            // Le lien public que la fiche partage par WhatsApp (seuls les biens publics le sont).
            'slug' => $p->slug,
            'type' => $p->type,
            'contract_type' => $p->contract_type,
            'price' => $p->price,
            'bedrooms' => $p->bedrooms,
            'visibility' => $p->visibility,
            'status' => $p->status,
            'city' => $p->address?->city,
            'neighborhood' => $p->address?->neighborhood,
        ])->values()->all());
    }

    /**
     * Les prospects de l'agence que le bien intéresse : le compte, et la liste. Un prospect que
     * l'appelant ne peut pas lire reste compté, mais sans nom — le même contrat que le détecteur
     * de doublons.
     */
    public function forProperty(Request $request, Property $property): JsonResponse
    {
        $this->authorize('matchProspects', $property);

        $viewer = $request->user();
        $paginator = $this->matcher->customersFor($property)
            ->orderByDesc('customers.updated_at')
            ->orderByDesc('customers.id')
            ->paginate($this->pageSize($request));

        return $this->paginated($paginator, $paginator->getCollection()->map(function (Customer $c) use ($viewer) {
            $visible = $viewer->can('view', $c);

            return [
                'id' => $visible ? $c->id : null,
                'name' => $visible ? $c->full_name : null,
                'pipeline_stage' => $visible ? $c->pipeline_stage : null,
            ];
        })->values()->all());
    }

    private function pageSize(Request $request): int
    {
        return max(1, min(self::MAX_PER_PAGE, (int) $request->input('per_page', 20)));
    }
}
