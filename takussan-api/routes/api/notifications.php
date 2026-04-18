<?php

use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\NotificationPreferenceController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('notifications', [NotificationController::class, 'index'])->name('notifications.index');
    Route::post('notifications/{notification}/read', [NotificationController::class, 'markAsRead'])->name('notifications.read');
    Route::post('notifications/read-all', [NotificationController::class, 'markAllRead'])->name('notifications.read-all');

    // Notification preferences
    Route::get('notifications/preferences', [NotificationPreferenceController::class, 'show'])->name('notifications.preferences.show');
    Route::put('notifications/preferences', [NotificationPreferenceController::class, 'update'])->name('notifications.preferences.update');
});
