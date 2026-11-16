<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\AnswerBookingCounterOfferRequest;
use App\Http\Requests\Api\StoreBookingCounterOfferRequest;
use App\Models\Booking;
use App\Models\BookingCounterOffer;
use App\Services\Booking\BookingCounterOfferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2873 (ADR-0110 § 5) — la contre-offre sur une offre d'achat.
 *
 * - `POST bookings/{booking}/counter-offers` : le personnel de l'agence du bien
 *   (`BookingPolicy::proposeCounterOffer`) ;
 * - `POST bookings/{booking}/counter-offers/{counterOffer}/accept|decline` : le client de la
 *   réservation (`BookingPolicy::answerCounterOffer`). `{counterOffer}` est lié à `{booking}`
 *   (`scopeBindings`) : celle d'une autre réservation rend 404.
 *
 * Chaque geste rend la réservation sous la forme du `show` (`BookingController::show`) : son
 * auteur la lit déjà.
 */
class BookingCounterOfferController extends Controller
{
    public function __construct(private readonly BookingCounterOfferService $counterOffers) {}

    public function store(StoreBookingCounterOfferRequest $request, Booking $booking): JsonResponse
    {
        $this->counterOffers->propose($booking, $request->validated(), $request->user());

        return $this->present($request, $booking, 201);
    }

    public function accept(AnswerBookingCounterOfferRequest $request, Booking $booking, BookingCounterOffer $counterOffer): JsonResponse
    {
        $this->counterOffers->accept($booking, $counterOffer, $request->user());

        return $this->present($request, $booking);
    }

    public function decline(AnswerBookingCounterOfferRequest $request, Booking $booking, BookingCounterOffer $counterOffer): JsonResponse
    {
        $this->counterOffers->decline($booking, $counterOffer, $request->user());

        return $this->present($request, $booking);
    }

    private function present(Request $request, Booking $booking, int $status = 200): JsonResponse
    {
        return $this->json(['data' => app(BookingController::class)->presentFor($request, $booking->refresh())], $status);
    }
}
