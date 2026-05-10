<?php

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
});
