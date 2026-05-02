<?php

use App\Http\Controllers\Api\CalendarController;
use App\Http\Controllers\Api\DashboardAgencyController;
use App\Http\Controllers\Api\DashboardAgentController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DashboardOwnerController;
use App\Http\Controllers\Api\DashboardTenantController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('dashboard/stats', [DashboardController::class, 'stats'])->name('dashboard.stats');
    Route::get('calendar', [CalendarController::class, 'index'])->name('calendar.index');

    // TCK-032 — adaptive entry + role-based dashboards
    Route::get('dashboard/me', [DashboardController::class, 'me'])->name('dashboard.me');
    Route::get('dashboard/agency', [DashboardAgencyController::class, 'show'])->name('dashboard.agency');
    Route::get('dashboard/owner', [DashboardOwnerController::class, 'show'])->name('dashboard.owner');
    Route::get('dashboard/agent', [DashboardAgentController::class, 'show'])->name('dashboard.agent');
    Route::get('dashboard/tenant', [DashboardTenantController::class, 'show'])->name('dashboard.tenant');
});
