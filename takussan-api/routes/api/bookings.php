<?php

use App\Http\Controllers\Api\Admin\BookingController as AdminBookingController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\BookingDossierController;
use App\Http\Controllers\Api\BookingGuarantorController;
use App\Http\Controllers\Api\BookingPaymentController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('bookings', [BookingController::class, 'index'])->name('bookings.index');
    // TCK-1406 (ADR-0072) — une réservation rejouée sous la même clé n'est créée qu'une fois.
    Route::post('bookings', [BookingController::class, 'store'])->middleware('idempotent')->name('bookings.store');
    // TCK-2593 — les compteurs nature × statut ; littérale, donc AVANT `bookings/{booking}`.
    Route::get('bookings/counts', [BookingController::class, 'counts'])->name('bookings.counts');
    Route::get('bookings/{booking}', [BookingController::class, 'show'])->name('bookings.show');
    Route::post('bookings/{booking}/confirm', [BookingController::class, 'confirm'])->name('bookings.confirm');
    Route::post('bookings/{booking}/cancel', [BookingController::class, 'cancel'])->name('bookings.cancel');
    Route::post('bookings/{booking}/reject', [BookingController::class, 'reject'])->name('bookings.reject');

    // TCK-2872 (ADR-0110 § 2) — le dossier d'une candidature ou d'une offre ; `{piece}` est une
    // `DossierPiece` (une valeur hors de l'enum rend 404). Un séjour n'a pas de dossier (404).
    Route::get('bookings/{booking}/dossier', [BookingDossierController::class, 'index'])->name('bookings.dossier.index');
    Route::post('bookings/{booking}/dossier/{piece}/document', [BookingDossierController::class, 'upload'])->name('bookings.dossier.upload');
    Route::post('bookings/{booking}/dossier/{piece}/request', [BookingDossierController::class, 'requestPiece'])->name('bookings.dossier.request');

    // TCK-2893 (ADR-0110 § 3 et 4) — les garants d'une candidature ou d'une offre (trois au plus), et
    // le revenu déclaré du candidat EN CLAIR : admin de l'agence, sous step-up, consultation journalisée.
    Route::post('bookings/{booking}/guarantors', [BookingGuarantorController::class, 'store'])->name('bookings.guarantors.store');
    Route::delete('bookings/{booking}/guarantors/{guarantor}', [BookingGuarantorController::class, 'destroy'])->name('bookings.guarantors.destroy');
    Route::get('bookings/{booking}/sensitive', [BookingController::class, 'sensitive'])
        ->whereNumber('booking')
        ->name('bookings.sensitive');

    // TCK-101 — admin force-expire (agency_admin / super_admin). Moved out of
    // /api/admin/* (now super-admin only since TCK-144) — controller still
    // owns the role check.
    Route::post('bookings/{booking}/expire-now', [AdminBookingController::class, 'expireNow'])
        ->name('bookings.expire-now');

    // Nested payments
    Route::get('bookings/{booking}/payments', [BookingPaymentController::class, 'index'])
        ->name('bookings.payments.index');
    // TCK-1400 (ADR-0072) — un acompte rejoué sous la même clé n'est encaissé qu'une fois.
    Route::post('bookings/{booking}/payments', [BookingPaymentController::class, 'store'])
        ->middleware('idempotent')
        ->name('bookings.payments.store');
    Route::post('booking-payments/{payment}/refund', [BookingPaymentController::class, 'refund'])
        ->name('booking-payments.refund');

    // TCK-172 — quittance PDF d'un BookingPayment acquitté.
    Route::get('booking-payments/{payment}/receipt', [BookingPaymentController::class, 'receipt'])
        ->name('booking-payments.receipt');
});
