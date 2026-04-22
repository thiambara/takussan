<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast Channels (TCK-022 notifications)
|--------------------------------------------------------------------------
|
| Private per-user channel used by:
|   - Illuminate\Notifications\Notification::broadcastOn() (default name
|     `App.Models.User.{id}` via `receivesBroadcastNotificationsOn`)
|   - \App\Events\NewNotification::broadcastOn()
|
| A user may only subscribe to their own notification channel.
*/

Broadcast::channel('App.Models.User.{userId}', function (User $user, int $userId) {
    return (int) $user->id === (int) $userId;
});
