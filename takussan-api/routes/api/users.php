<?php

use App\Http\Controllers\Api\UserAdminController;
use App\Http\Controllers\Api\UserRoleController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('users', [UserAdminController::class, 'index'])->name('users.index');
    Route::post('users/{user}/block', [UserAdminController::class, 'block'])->name('users.block');
    Route::post('users/{user}/activate', [UserAdminController::class, 'activate'])->name('users.activate');
    // TCK-278 — `POST users/{user}/roles` / `DELETE …/roles/{role}` retirées :
    // la mutation de rôle passe désormais par `PUT users/{user}/role` qui
    // matérialise les profils polymorphes (cf. UserRoleController).
    Route::put('users/{user}/role', [UserRoleController::class, 'update'])->name('users.role.update');
    Route::delete('users/{user}', [UserAdminController::class, 'destroy'])->name('users.destroy');
});
