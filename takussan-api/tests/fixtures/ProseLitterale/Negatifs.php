<?php

use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

// Fixture de ProseLitteraleInterditeTest — jamais exécutée. AUCUN positif.

function negatifs($request, $user, $amount): void
{
    abort(404);
    abort_if($user === null, 403);
    abort_code(422, 'kyc.documents_missing', ['missing' => 'rccm']);
    abort(403, __('errors.http.forbidden'));
    $title = __('notifications.codes.booking.confirmed.title', ['property' => 'Villa']);
    $count = trans_choice('notifications.days', 3);
    Log::warning('Échec de la synchronisation', ['user' => $user]);
    logger()->info('Rappel envoyé au locataire');
    response()->json(['message' => 'ok']);
    throw ValidationException::withMessages(['event' => 'notification_event_not_editable']);
    // number_format hors de Notifications/ : un export CSV, pas un texte affiché
    $csv = number_format($amount, 2, '.', '');
    $config = ['title' => 'Titre de configuration'];
}
