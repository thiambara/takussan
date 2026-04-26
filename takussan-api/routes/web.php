<?php

use App\Http\Controllers\NotificationUnsubscribeController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// TCK-103 — One-click unsubscribe from digest emails (signed URL, no auth required).
Route::get('notifications/unsubscribe/{user}', NotificationUnsubscribeController::class)
    ->name('notifications.unsubscribe')
    ->middleware('signed');
