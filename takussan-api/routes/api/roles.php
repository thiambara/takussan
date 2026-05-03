<?php

use App\Http\Controllers\Api\PermissionController;
use App\Http\Controllers\Api\RoleController;
use Illuminate\Support\Facades\Route;

// TCK-135 — agency-scoped role editor and permission catalogue. The
// /api/agency-roles routes from TCK-014 are superseded by these.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('roles', [RoleController::class, 'index'])->name('roles.index');
    Route::post('roles', [RoleController::class, 'store'])->name('roles.store');
    Route::patch('roles/{role}', [RoleController::class, 'update'])->name('roles.update');
    Route::put('roles/{role}', [RoleController::class, 'update']);
    Route::delete('roles/{role}', [RoleController::class, 'destroy'])->name('roles.destroy');

    Route::post('roles/{role}/permissions', [RoleController::class, 'attachPermission'])
        ->name('roles.permissions.attach');
    Route::delete('roles/{role}/permissions/{permission}', [RoleController::class, 'detachPermission'])
        ->name('roles.permissions.detach');

    Route::get('permissions', [PermissionController::class, 'index'])->name('permissions.index');
});
