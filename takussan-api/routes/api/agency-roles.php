<?php

use App\Http\Controllers\Api\Agency\RoleController;
use App\Http\Controllers\Api\CapabilityController;
use App\Http\Controllers\Api\Profile\AgencyRoleController;
use Illuminate\Support\Facades\Route;

/**
 * TCK-279 — rôles personnalisés par agence.
 *
 * `routes/api/agencies.php` étant déjà à 90 lignes et couvrant sept
 * domaines, les rôles prennent leur propre fichier — `routes/api.php`
 * fait un `glob()`, il n'y a rien à enregistrer.
 */
Route::middleware('auth:sanctum')->group(function (): void {
    // Catalogue plateforme des capacités — littéral, donc déclaré avant
    // toute route paramétrée du même préfixe (convention du dépôt).
    Route::get('capabilities', [CapabilityController::class, 'index'])->name('capabilities.index');

    Route::get('agencies/{agency}/roles', [RoleController::class, 'index'])->name('agencies.roles.index');
    Route::post('agencies/{agency}/roles', [RoleController::class, 'store'])->name('agencies.roles.store');
    Route::get('agencies/{agency}/roles/{role}', [RoleController::class, 'show'])->name('agencies.roles.show');
    Route::patch('agencies/{agency}/roles/{role}', [RoleController::class, 'update'])->name('agencies.roles.update');
    Route::put('agencies/{agency}/roles/{role}', [RoleController::class, 'update']);
    Route::delete('agencies/{agency}/roles/{role}', [RoleController::class, 'destroy'])->name('agencies.roles.destroy');
    Route::put('agencies/{agency}/roles/{role}/capabilities', [RoleController::class, 'syncCapabilities'])
        ->name('agencies.roles.capabilities.update');

    // Réaffectation d'un profil. `{profile}` est un id nu : le type vient du
    // corps (`profile_type`) — cf. AssignAgencyRoleRequest.
    Route::patch('profiles/{profile}/agency-role', [AgencyRoleController::class, 'update'])
        ->name('profiles.agency-role.update');
});
