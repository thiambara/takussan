<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\AttachBookingGuarantorRequest;
use App\Models\Booking;
use App\Models\Guarantor;
use App\Services\Booking\BookingGuarantorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2893 (ADR-0110 § 3) — les garants d'une candidature ou d'une offre.
 *
 * - `POST   bookings/{booking}/guarantors` : un garant existant ou une fiche neuve ; trois au plus ;
 * - `DELETE bookings/{booking}/guarantors/{guarantor}` : le dernier retiré retire ses pièces.
 *
 * Par le client de la réservation ou le personnel de l'agence du bien
 * (`BookingPolicy::manageGuarantors`). La réponse ne porte que des identifiants et le compte : la
 * liste se lit dans la réservation, au seul personnel (`BookingGuarantorFacts`).
 */
class BookingGuarantorController extends Controller
{
    public function __construct(private readonly BookingGuarantorService $guarantors) {}

    public function store(AttachBookingGuarantorRequest $request, Booking $booking): JsonResponse
    {
        $guarantor = $this->guarantors->attach($booking, $request->validated(), $request->user());

        return $this->json([
            'data' => [
                'booking_id' => $booking->id,
                'guarantor_id' => $guarantor->id,
                'guarantors_count' => $booking->guarantors()->count(),
            ],
        ], 201);
    }

    public function destroy(Request $request, Booking $booking, Guarantor $guarantor): JsonResponse
    {
        $this->authorize('manageGuarantors', $booking);
        $restants = $this->guarantors->detach($booking, $guarantor);

        return $this->json([
            'data' => [
                'booking_id' => $booking->id,
                'guarantor_id' => $guarantor->id,
                'guarantors_count' => $restants,
            ],
        ]);
    }
}
