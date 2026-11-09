<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StoreAgencySpotlightRequest;
use App\Models\AgencySpotlight;
use App\Support\Http\ParametreUnique;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * TCK-2520 (ADR-0092) — la place « Mise en avant » de l'annuaire des agences, offerte par la
 * plateforme : la liste, l'offre, le retrait. Rangée avec la console des crédits et boosts
 * (`routes/api/admin-credits.php`), même garde ; les écritures sont sous second facteur récent.
 */
class AdminAgencySpotlightController extends Controller
{
    /** `filter[when]=current|upcoming|past` ; sans filtre, toutes, les plus récentes d'abord. */
    public function index(Request $request): JsonResponse
    {
        $quand = ParametreUnique::valeur(((array) $request->input('filter', []))['when'] ?? null);
        $maintenant = now();

        $paginator = AgencySpotlight::query()
            ->with(['agency:id,name,slug,status', 'city:id,name', 'grantedBy:id,first_name,last_name'])
            ->when($quand === 'current', fn ($q) => $q->where('starts_at', '<=', $maintenant)->where('ends_at', '>', $maintenant))
            ->when($quand === 'upcoming', fn ($q) => $q->where('starts_at', '>', $maintenant))
            ->when($quand === 'past', fn ($q) => $q->where('ends_at', '<=', $maintenant))
            ->orderByDesc('starts_at')
            ->orderByDesc('id')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 25))));

        return $this->paginated($paginator, $paginator->getCollection()->map(fn (AgencySpotlight $p) => $this->forme($p))->all());
    }

    public function store(StoreAgencySpotlightRequest $request): JsonResponse
    {
        $donnees = $request->validated();
        [$debut, $fin] = $request->periode();

        try {
            // Un point de reprise : une violation de la contrainte n'abandonne que lui, et la
            // transaction de l'appelant (celle d'un test, ou d'un autre) reste utilisable.
            $place = DB::transaction(fn () => AgencySpotlight::query()->create([
                'agency_id' => (int) $donnees['agency_id'],
                'geo_city_id' => $donnees['geo_city_id'] !== null ? (int) $donnees['geo_city_id'] : null,
                'starts_at' => $debut,
                'ends_at' => $fin,
                'granted_by_id' => $request->user()->id,
                'note' => $donnees['note'],
            ]));
        } catch (QueryException $e) {
            // 23P01 : `exclusion_violation` — une offre concurrente a pris la place entre la
            // vérification de la requête et l'écriture.
            if ($e->getCode() === '23P01') {
                throw ValidationException::withMessages(['starts_at' => __('credits.spotlight.overlap')]);
            }
            throw $e;
        }

        activity('AgencySpotlight')
            ->performedOn($place)
            ->causedBy($request->user())
            ->withProperties([
                'agency_id' => $place->agency_id,
                'geo_city_id' => $place->geo_city_id,
                'starts_at' => $this->instant($place->starts_at),
                'ends_at' => $this->instant($place->ends_at),
                'reason' => $place->note,
            ])
            ->event('super_admin_agency_spotlight_granted')
            ->log('Mise en avant d\'agence offerte');

        return $this->json(['data' => $this->forme($place->load(['agency:id,name,slug,status', 'city:id,name', 'grantedBy:id,first_name,last_name']))], 201);
    }

    /**
     * `{spotlight}` n'est PAS lié par le modèle : `SubstituteBindings` résout un paramètre lié AVANT
     * la garde `super-admin`, et un 404 rendu à qui n'a aucun droit sur `/api/admin/*` dirait si
     * l'identifiant existe (`NamespaceAccessGuardTest`). La ligne se cherche ici, après la garde.
     */
    public function destroy(Request $request, int $spotlight): JsonResponse
    {
        $spotlight = AgencySpotlight::query()->findOrFail($spotlight);

        activity('AgencySpotlight')
            ->performedOn($spotlight)
            ->causedBy($request->user())
            ->withProperties([
                'agency_id' => $spotlight->agency_id,
                'geo_city_id' => $spotlight->geo_city_id,
                'starts_at' => $this->instant($spotlight->starts_at),
                'ends_at' => $this->instant($spotlight->ends_at),
            ])
            ->event('super_admin_agency_spotlight_revoked')
            ->log('Mise en avant d\'agence retirée');

        $spotlight->delete();

        return $this->json(['data' => ['id' => $spotlight->id, 'deleted' => true]]);
    }

    /** @return array<string, mixed> */
    private function forme(AgencySpotlight $place): array
    {
        return [
            'id' => $place->id,
            'agency_id' => $place->agency_id,
            'agency' => $place->agency === null ? null : [
                'id' => $place->agency->id,
                'name' => $place->agency->name,
                'slug' => $place->agency->slug,
                'status' => $place->agency->status?->value,
            ],
            'geo_city_id' => $place->geo_city_id,
            'city' => $place->city === null ? null : ['id' => $place->city->id, 'name' => $place->city->name],
            'starts_at' => $this->instant($place->starts_at),
            'ends_at' => $this->instant($place->ends_at),
            'note' => $place->note,
            'granted_by' => $place->grantedBy === null ? null : [
                'id' => $place->grantedBy->id,
                'name' => trim($place->grantedBy->first_name.' '.$place->grantedBy->last_name),
            ],
        ];
    }
}
