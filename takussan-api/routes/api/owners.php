<?php

use App\Http\Controllers\Api\OwnerDepartureController;
use App\Http\Controllers\Api\OwnerProfileController;
use Illuminate\Support\Facades\Route;

/**
 * TCK-256 — owner profiles surface (read-only listing, scoped by the
 * actor's agency). The mutation endpoints (`invite`, `resend`, `revoke`)
 * live on the per-agency / generic-invitation routes already wired
 * elsewhere — see `routes/api/agencies.php` and `routes/api/invitations.php`.
 */
Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('owners', [OwnerProfileController::class, 'index'])->name('owners.index');
    // TCK-601 (ADR-0044) — valeurs complètes, admin de l'agence du profil, consultation journalisée.
    Route::get('owners/{ownerProfile}/sensitive', [OwnerProfileController::class, 'sensitive'])
        ->whereNumber('ownerProfile')
        ->name('owners.sensitive');
    // TCK-2640 — la fiche du bailleur (admin de l'agence du profil) et le réglage de son plafond de
    // travaux (`owners.update`).
    Route::get('owners/{ownerProfile}', [OwnerProfileController::class, 'show'])
        ->whereNumber('ownerProfile')
        ->name('owners.show');
    Route::patch('owners/{ownerProfile}', [OwnerProfileController::class, 'update'])
        ->whereNumber('ownerProfile')
        ->name('owners.update');
    // TCK-2753 (ADR-0108) — le départ d'un bailleur : ce qui le bloque encore, puis le geste (admin de
    // l'agence du profil, double authentification).
    Route::get('owners/{ownerProfile}/departure', [OwnerDepartureController::class, 'show'])
        ->whereNumber('ownerProfile')
        ->name('owners.departure.show');
    Route::delete('owners/{ownerProfile}', [OwnerDepartureController::class, 'destroy'])
        ->whereNumber('ownerProfile')
        ->name('owners.departure.destroy');
});
