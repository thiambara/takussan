<?php

use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\NotificationPreferenceController;
use App\Http\Controllers\NotificationUnsubscribeController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('notifications', [NotificationController::class, 'index'])->name('notifications.index');
    Route::post('notifications/{notification}/read', [NotificationController::class, 'markAsRead'])->name('notifications.read');
    Route::post('notifications/{notification}/unread', [NotificationController::class, 'markAsUnread'])->name('notifications.unread');
    Route::post('notifications/read-all', [NotificationController::class, 'markAllRead'])->name('notifications.read-all');

    // Notification preferences (event_type × channel matrix) — TCK-070 ; le doublon
    // `notifications/preferences`, sans appelant, est retiré (TCK-780).
    Route::get('me/notification-preferences', [NotificationPreferenceController::class, 'show'])->name('me.notification-preferences.show');
    Route::patch('me/notification-preferences', [NotificationPreferenceController::class, 'update'])->name('me.notification-preferences.update');
    Route::put('me/notification-preferences', [NotificationPreferenceController::class, 'update']);

    Route::get('announcements/active', [AnnouncementController::class, 'active'])->name('announcements.active');
    Route::post('announcements/{announcement}/dismiss', [AnnouncementController::class, 'dismiss'])->name('announcements.dismiss');
});

// P97.06 (TCK-1243, ADR-0050) — hors session : se désabonner du résumé par courriel, depuis la page
// du front ou le client de messagerie (RFC 8058). URL signée RELATIVE, `POST` seulement.
Route::post('notifications/digest/unsubscribe/{user}', [NotificationUnsubscribeController::class, 'unsubscribe'])
    ->middleware(['signed:relative', 'throttle:public-search-alert'])
    ->name('notifications.digest.unsubscribe');
