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
    // TCK-2364 (P241.02, ADR-0049 « Ventilation » § 2) — le taux de commission de l'agent, depuis
    // sa fiche de membre.
    Route::patch('profiles/{agent_profile}/commission-rate', [AgentProfileController::class, 'updateCommissionRate'])
        ->name('profiles.agent.commission-rate');
    Route::delete('profiles/{agent_profile}', [AgentProfileController::class, 'destroy'])
        ->name('profiles.agent.destroy');
});
