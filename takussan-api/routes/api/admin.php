<?php

use App\Http\Controllers\Api\Admin\PropertyModerationController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Admin-only routes — TCK-098 and beyond
|--------------------------------------------------------------------------
| All routes here require authentication. Per-route role checks live
| in the controllers to keep the gate logic co-located with the action.
*/

Route::middleware('auth:sanctum')->prefix('admin')->group(function () {

    // TCK-098 — Property moderation queue
    Route::prefix('properties')->group(function () {
        Route::get('moderation', [PropertyModerationController::class, 'index'])
            ->name('admin.properties.moderation.index');
        Route::post('{property}/approve', [PropertyModerationController::class, 'approve'])
            ->name('admin.properties.moderation.approve');
        Route::post('{property}/reject', [PropertyModerationController::class, 'reject'])
            ->name('admin.properties.moderation.reject');
        Route::post('{property}/resubmit', [PropertyModerationController::class, 'resubmit'])
            ->name('admin.properties.moderation.resubmit');
    });

});
