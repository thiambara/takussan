<?php

use App\Http\Controllers\Api\Agency\RegenerateWatermarksController;
use App\Http\Controllers\Api\AgencyController;
use App\Http\Controllers\Api\AgencyMemberRoleController;
use App\Http\Controllers\Api\AgencyRoleController;
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

    // Agency reviews
    Route::get('agencies/{agency}/reviews', [ReviewController::class, 'indexForAgency'])->name('agencies.reviews.index');
    Route::post('agencies/{agency}/reviews', [ReviewController::class, 'storeForAgency'])->name('agencies.reviews.store');

    // Agency custom roles
    Route::get('agency-roles', [AgencyRoleController::class, 'index'])->name('agency-roles.index');
    Route::post('agency-roles', [AgencyRoleController::class, 'store'])->name('agency-roles.store');
    Route::put('agency-roles/{role}', [AgencyRoleController::class, 'update'])->name('agency-roles.update');
    Route::delete('agency-roles/{role}', [AgencyRoleController::class, 'destroy'])->name('agency-roles.destroy');

    // TCK-108 — Role delegations (temporary permission grants)
    Route::get('agencies/{agency}/role-delegations', [RoleDelegationController::class, 'index'])->name('agencies.role-delegations.index');
    Route::post('agencies/{agency}/role-delegations', [RoleDelegationController::class, 'store'])->name('agencies.role-delegations.store');
    Route::delete('agencies/{agency}/role-delegations/{delegation}', [RoleDelegationController::class, 'destroy'])->name('agencies.role-delegations.destroy');
});
