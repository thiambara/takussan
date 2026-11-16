<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\RequestBookingDossierPieceRequest;
use App\Http\Requests\Api\UploadBookingDossierPieceRequest;
use App\Http\Resources\BookingDossierItemResource;
use App\Models\Booking;
use App\Models\Enums\DossierPiece;
use App\Services\Booking\BookingDossierService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2872 (ADR-0110 § 2) — le dossier d'une candidature ou d'une offre.
 *
 * - `GET  bookings/{booking}/dossier` : qui lit la réservation (`BookingPolicy::view` — le client,
 *   le personnel de l'agence du bien, le bailleur, l'auteur encore membre) lit son dossier, comme
 *   `DocumentPolicy` lui en ouvre les pièces (ADR-0099) ;
 * - `POST bookings/{booking}/dossier/{piece}/document` : le dépôt, par le client ou le personnel ;
 * - `POST bookings/{booking}/dossier/{piece}/request` : « Demander », par le personnel.
 *
 * Un séjour n'a pas de dossier : 404 `booking.dossier_not_found`, après le 403 d'un lecteur refusé
 * (comme `show`). Une pièce hors de la liste de la réservation : 404 `booking.dossier_piece_not_found`.
 */
class BookingDossierController extends Controller
{
    public function __construct(private readonly BookingDossierService $dossier) {}

    public function index(Request $request, Booking $booking): JsonResponse
    {
        $this->authorize('view', $booking);
        $this->dossier->assertHasDossier($booking);

        return $this->json(['data' => $this->presenter($request, $booking)]);
    }

    public function upload(UploadBookingDossierPieceRequest $request, Booking $booking, DossierPiece $piece): JsonResponse
    {
        $item = $this->dossier->upload($booking, $piece, $request->file('file'), $request->user());

        return $this->json([
            'data' => BookingDossierItemResource::make($item)->resolve($request),
            'dossier' => $this->summary($booking),
        ], 201);
    }

    public function requestPiece(RequestBookingDossierPieceRequest $request, Booking $booking, DossierPiece $piece): JsonResponse
    {
        [$item, $notified] = $this->dossier->request($booking, $piece, $request->user());

        return $this->json([
            'data' => BookingDossierItemResource::make($item)->resolve($request) + ['customer_notified' => $notified],
        ]);
    }

    /** @return array<string, mixed> */
    private function presenter(Request $request, Booking $booking): array
    {
        return $this->summary($booking) + [
            'pieces' => BookingDossierItemResource::collection($this->dossier->items($booking))->toArray($request),
        ];
    }

    /** @return array{received: int, required: int, missing: list<string>} */
    private function summary(Booking $booking): array
    {
        return $this->dossier->summaries([(int) $booking->id])[(int) $booking->id]
            ?? ['received' => 0, 'required' => 0, 'missing' => []];
    }
}
