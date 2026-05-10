<?php

use App\Http\Controllers\Api\Agency\AgentInvitationController;
use App\Http\Controllers\Api\Agency\KycController;
use App\Http\Controllers\Api\Agency\OwnerInvitationController;
use App\Http\Controllers\Api\Agency\RegenerateWatermarksController;
use App\Http\Controllers\Api\Agency\TeamController;
use App\Http\Controllers\Api\Agency\TenantOnboardingPendingController;
use App\Http\Controllers\Api\AgencyController;
use App\Http\Controllers\Api\AgencyMemberRoleController;
use App\Http\Controllers\Api\AgencyStatsController;
use App\Http\Controllers\Api\Permissions\RoleDelegationController;
use App\Http\Controllers\Api\ReviewController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('agencies', [AgencyController::class, 'index'])->name('agencies.index');
    Route::post('agencies', [AgencyController::class, 'store'])->name('agencies.store');
    Route::get('agencies/{agency}', [AgencyController::class, 'show'])->name('agencies.show');
    Route::put('agencies/{agency}', [AgencyController::class, 'update'])->name('agencies.update');
    Route::patch('agencies/{agency}', [AgencyController::class, 'update']);
    Route::delete('agencies/{agency}', [AgencyController::class, 'destroy'])->name('agencies.destroy');

    // Agent management (legacy aliases kept — /members is the TCK-015 canonical path).
    Route::post('agencies/{agency}/agents', [AgencyController::class, 'addAgent'])->name('agencies.agents.store');
    Route::delete('agencies/{agency}/agents/{user}', [AgencyController::class, 'removeAgent'])->name('agencies.agents.destroy');
    Route::get('agencies/{agency}/members', [AgencyController::class, 'listMembers'])->name('agencies.members.index');
    Route::post('agencies/{agency}/members', [AgencyController::class, 'addAgent'])->name('agencies.members.store');
    Route::delete('agencies/{agency}/members/{user}', [AgencyController::class, 'removeAgent'])->name('agencies.members.destroy');
    // PATCH alias for member role assignment — mirrors the PUT canonical route.
    Route::patch('agencies/{agency}/members/{user}', [AgencyMemberRoleController::class, 'update'])->name('agencies.members.update');

    // Agency-scoped member role assignment.
    Route::put('agencies/{agency}/members/{user}/role', [AgencyMemberRoleController::class, 'update'])->name('agencies.members.role.update');

    // TCK-106 — bulk regenerate watermarks for all property photos in an agency.
    Route::post('agencies/{agency}/regenerate-watermarks', RegenerateWatermarksController::class)->name('agencies.regenerate-watermarks');

    // Agency stats (P1 — simple aggregates, no cache).
    Route::get('agencies/{agency}/stats', [AgencyStatsController::class, 'show'])->name('agencies.stats.show');

    // Agency KYC dossier.
    Route::get('agencies/{agency}/kyc', [KycController::class, 'show'])->name('agencies.kyc.show');
    Route::post('agencies/{agency}/kyc/documents', [KycController::class, 'upload'])->name('agencies.kyc.documents.store');
    Route::post('agencies/{agency}/kyc/submit', [KycController::class, 'submit'])->name('agencies.kyc.submit');

    // Agency reviews
    Route::get('agencies/{agency}/reviews', [ReviewController::class, 'indexForAgency'])->name('agencies.reviews.index');
    Route::post('agencies/{agency}/reviews', [ReviewController::class, 'storeForAgency'])->name('agencies.reviews.store');

    // TCK-108 — Role delegations (temporary permission grants)
    Route::get('agencies/{agency}/role-delegations', [RoleDelegationController::class, 'index'])->name('agencies.role-delegations.index');
    Route::post('agencies/{agency}/role-delegations', [RoleDelegationController::class, 'store'])->name('agencies.role-delegations.store');
    Route::delete('agencies/{agency}/role-delegations/{delegation}', [RoleDelegationController::class, 'destroy'])->name('agencies.role-delegations.destroy');

    // TCK-256 — invitation propriétaire depuis l'espace agence (form dédié
    // dans /app/owners ou ouvert depuis le form de création de bien).
    // Resend / revoke réutilisent les routes génériques /api/invitations/{id}/*
    // exposées par TCK-249 (InvitationController).
    Route::post('agencies/{agency}/owners/invite', OwnerInvitationController::class)
        ->name('agencies.owners.invite');

    // TCK-258 — équipe : listing membres + invitation agent. Resend / revoke
    // réutilisent les routes génériques /api/invitations/{id}/*. Suspend /
    // remove sont sur /api/profiles/{agent_profile} (routes/api/profiles.php).
    Route::get('agencies/{agency}/team', [TeamController::class, 'index'])
        ->name('agencies.team.index');
    Route::post('agencies/{agency}/agents/invite', AgentInvitationController::class)
        ->name('agencies.agents.invite');

    // TCK-266 — Console agence : queue locataires avec onboarding bloqué
    // (EDL d'entrée non signé > 7 j). Réservée aux membres de l'agence
    // (agency_admin / agent) et aux super-admins.
    Route::get('agencies/{agency}/tenant-onboarding-pending', [TenantOnboardingPendingController::class, 'index'])
        ->name('agencies.tenant-onboarding-pending.index');
});
