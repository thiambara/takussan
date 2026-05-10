<?php

use App\Http\Controllers\Api\AgentProfileController;
use Illuminate\Support\Facades\Route;

/**
 * TCK-258 — agent profile lifecycle endpoints exposed for the team
 * management surface (`/app/team`). The invitation entry-point lives
 * on `routes/api/agencies.php` (`POST /agencies/{id}/agents/invite`).
 */
Route::middleware('auth:sanctum')->group(function (): void {
    Route::patch('profiles/{agent_profile}/suspend', [AgentProfileController::class, 'suspend'])
        ->name('profiles.agent.suspend');
    Route::delete('profiles/{agent_profile}', [AgentProfileController::class, 'destroy'])
        ->name('profiles.agent.destroy');
});
