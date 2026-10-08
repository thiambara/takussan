<?php

use App\Http\Controllers\Api\UserAdminController;
use App\Http\Controllers\Api\UserRoleController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('users', [UserAdminController::class, 'index'])->name('users.index');
    // TCK-600 (verif-600 m1) — `POST users/{user}/block|activate` retirées : un second chemin du
    // cycle de vie, sans motif, sans activité, sans avis, sans la garde « opérateur » et sans fermer
    // une impersonation ouverte. Bloquer et réactiver passent par la console :
    // `POST /api/admin/users/{user}/block|reactivate` (`UserLifecycleController`).
    // TCK-278 — `POST users/{user}/roles` / `DELETE …/roles/{role}` retirées :
    // la mutation de rôle passe désormais par `PUT users/{user}/role` qui
    // matérialise les profils polymorphes (cf. UserRoleController).
    Route::put('users/{user}/role', [UserRoleController::class, 'update'])->name('users.role.update');
});
