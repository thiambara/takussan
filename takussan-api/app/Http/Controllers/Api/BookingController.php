<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\CancelBookingRequest;
use App\Http\Requests\Api\RejectBookingRequest;
use App\Http\Requests\Api\StoreBookingRequest;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Property;
use App\Models\User;
use App\Services\Booking\BookingCustomerFacts;
use App\Services\Booking\BookingMoneyAccess;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Model\BookingService;
use App\Services\Property\BailleurDuBien;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    public function __construct(protected BookingService $bookings) {}

    /** TCK-2579 — les colonnes de l'auteur que `created_by` lit : le nom, jamais une coordonnée. */
    private const AUTEUR = 'id,first_name,last_name,username';

    public function index(Request $request): JsonResponse
    {
        // TCK-2579 — `createdBy` (le nom de l'auteur, `created_by`), en une requête pour la page.
        $base = $this->visibleTo(
            Booking::query()->with(['property.address', 'property.media', 'customer', 'agency', 'createdBy:'.self::AUTEUR]),
            $request->user(),
        );

        $paginator = Booking::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        // TCK-2593 — `visits_on_property` de la page, en une requête.
        BookingCustomerFacts::prime($request, $paginator->getCollection());

        return $this->paginated($paginator, BookingResource::collection($paginator)->toArray($request));
    }

    /**
     * TCK-2593 — `GET /api/bookings/counts` : un compte par nature × statut, toutes les cases
     * présentes (0 comprises). Même portée que l'index ({@see self::visibleTo()}) et MÊMES filtres
     * (`Booking::buildQuery`, donc `managed_by`, `search`, `property_id`… et le 400 d'un filtre
     * inconnu) : chaque case égale le `meta.total` de l'index filtré sur cette nature et ce
     * statut. Une seule requête groupée ; tri, pagination et `include` n'y ont aucun effet.
     */
    public function counts(Request $request): JsonResponse
    {
        $rows = Booking::buildQuery($this->visibleTo(Booking::query(), $request->user()), $request)
            ->getEloquentBuilder()
            ->toBase()
            ->reorder()
            ->select(['bookings.kind', 'bookings.status'])
            ->selectRaw('count(*) as n')
            ->groupBy('bookings.kind', 'bookings.status')
            ->get();

        $counts = [];
        foreach (BookingKind::cases() as $kind) {
            foreach (BookingStatus::cases() as $status) {
                $counts[$kind->value][$status->value] = 0;
            }
        }
        foreach ($rows as $row) {
            if (isset($counts[$row->kind][$row->status])) {
                $counts[$row->kind][$row->status] = (int) $row->n;
            }
        }

        return $this->json(['data' => $counts]);
    }

    /**
     * Les réservations que l'appelant lit : la portée de l'index, partagée avec `counts`
     * (TCK-2593) — une seule définition, sinon les compteurs divergent de la liste.
     *
     * @param  Builder<Booking>  $query
     * @return Builder<Booking>
     */
    private function visibleTo(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        // P218.03 (TCK-2196) — le créateur encore membre de l'agence, comme `BookingPolicy::view`.
        $memberAgencyIds = app(MembershipCapabilityResolver::class)->memberAgencyIds($user);

        return $query->where(function ($q) use ($user, $memberAgencyIds) {
            $q->where(fn ($a) => $a->where('created_by_id', $user->id)
                ->where(fn ($m) => $m->whereNull('agency_id')->orWhereIn('agency_id', $memberAgencyIds)))
                // TCK-1930 (P190.02, décision du porteur) — le bailleur du bien, comme
                // `BookingPolicy::view` : plus l'agent créateur suspendu ou retiré.
                ->orWhereHas('property', fn ($p) => BailleurDuBien::restreindre($p, $user))
                ->orWhereHas('customer', fn ($c) => $c->where('user_id', $user->id));
            // TCK-587 — le périmètre d'agence est celui du PERSONNEL (ADR-0031) : un bailleur de l'agence
            // listait les ressources de tous les autres.
            if (($staffAgencyId = $user->staffAgencyId()) !== null) {
                $q->orWhere('agency_id', $staffAgencyId);
            }
        });
    }

    public function store(StoreBookingRequest $request): JsonResponse
    {
        $data = $request->validated();

        // TCK-1066 (P62.02) — un bien absent reçoit le refus d'un bien que l'appelant ne voit pas.
        $property = Property::query()->find((int) $data['property_id']);
        abort_code_if($property === null, 403, 'booking.property_unavailable');
        $booking = $this->bookings->create($property, $request->user(), $data);

        return $this->json(['data' => $this->presenter($request, $booking)], 201);
    }

    public function show(Request $request, Booking $booking): JsonResponse
    {
        $this->authorize('view', $booking);

        return $this->json(['data' => $this->presenter($request, $booking)]);
    }

    public function confirm(Request $request, Booking $booking): JsonResponse
    {
        // TCK-587 — `validate` : `bookings.validate` pour le personnel (`BookingPolicy`).
        $this->authorize('validate', $booking);
        $booking = $this->bookings->confirm($booking);

        return $this->json(['data' => $this->presenter($request, $booking)]);
    }

    public function cancel(CancelBookingRequest $request, Booking $booking): JsonResponse
    {

        $data = $request->validated();

        $booking = $this->bookings->cancel($booking, $request->user(), $data['reason'] ?? null);

        return $this->json(['data' => $this->presenter($request, $booking)]);
    }

    public function reject(RejectBookingRequest $request, Booking $booking): JsonResponse
    {

        $data = $request->validated();

        $booking = $this->bookings->reject($booking, $data['reason'] ?? null, $request->user());

        return $this->json(['data' => $this->presenter($request, $booking)]);
    }

    /**
     * ADR-0071 (TCK-1509, P95.03) — le seul chemin de présentation d'une réservation : le `show`
     * et les écritures (`store`, `confirm`, `cancel`, `reject`) rendent la même forme. Chaque
     * auteur d'une écriture est lecteur du `show` (`BookingPolicy` : créateur, bailleur, personnel
     * de l'agence, client), donc rien n'est montré à qui ne le lisait pas déjà.
     *
     * @return array<string, mixed>
     */
    private function presenter(Request $request, Booking $booking): array
    {
        $booking->load(['property.address', 'customer', 'payments', 'createdBy:'.self::AUTEUR]);
        // TCK-2593 — `visits_on_property`, comme à la liste.
        BookingCustomerFacts::prime($request, [$booking]);
        $data = BookingResource::make($booking)->resolve($request);
        // TCK-596 — le geste de remboursement ne s'affiche qu'à qui peut le faire aboutir.
        $data['can_refund'] = BookingMoneyAccess::canRefund($request->user(), $booking);

        return $data;
    }
}
