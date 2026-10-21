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

// P97.06 (TCK-1183, ADR-0050) — le désabonnement du résumé, hors session : la page du front le
// rejoue sur un clic, le client de messagerie par `List-Unsubscribe-Post`. URL signée RELATIVE et à
// échéance ; POST seulement, un GET ne désinscrit jamais.
Route::post('notifications/digest/unsubscribe/{user}', [NotificationUnsubscribeController::class, 'confirm'])
    ->middleware(['signed:relative', 'throttle:public-search-alert'])
    ->name('notifications.digest.unsubscribe');
