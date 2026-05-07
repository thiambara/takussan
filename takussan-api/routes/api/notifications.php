<?php

use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\NotificationPreferenceController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('notifications', [NotificationController::class, 'index'])->name('notifications.index');
    Route::post('notifications/{notification}/read', [NotificationController::class, 'markAsRead'])->name('notifications.read');
    Route::post('notifications/read-all', [NotificationController::class, 'markAllRead'])->name('notifications.read-all');

    // Notification preferences (event_type × channel matrix)
    Route::get('notifications/preferences', [NotificationPreferenceController::class, 'show'])->name('notifications.preferences.show');
    Route::put('notifications/preferences', [NotificationPreferenceController::class, 'update'])->name('notifications.preferences.update');

    // Canonical user-scoped aliases mandated by TCK-070 spec.
    Route::get('me/notification-preferences', [NotificationPreferenceController::class, 'show'])->name('me.notification-preferences.show');
    Route::patch('me/notification-preferences', [NotificationPreferenceController::class, 'update'])->name('me.notification-preferences.update');
    Route::put('me/notification-preferences', [NotificationPreferenceController::class, 'update']);

    Route::get('announcements/active', [AnnouncementController::class, 'active'])->name('announcements.active');
    Route::post('announcements/{announcement}/dismiss', [AnnouncementController::class, 'dismiss'])->name('announcements.dismiss');
});
