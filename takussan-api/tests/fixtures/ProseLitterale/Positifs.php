<?php

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

// Fixture de ProseLitteraleInterditeTest — jamais exécutée.

function positifs($request, $notifications, $user, $id, $max): void
{
    // (a) le message d'un abort
    abort(403, 'Interdit.');

    // (a) abort_if : le message est le troisième argument
    abort_if($user === null, 404, 'Utilisateur introuvable');

    // (b) le titre d'un notify() de NotificationService (quatre arguments ou plus)
    $notifications->notify($user, 'system', 'Votre export est prêt', __('notifications.body'));

    // (d) la valeur de 'message' =>
    response()->json(['message' => 'Opération réussie']);

    // (e) le message d'une HttpException
    throw new HttpException(409, 'Conflit de version');
    // (f) une HttpResponseException, sans condition de littéral
    throw new HttpResponseException(response()->json([], 422));
    // concaténation à une position (a) : deux littéraux, deux positifs
    abort(422, 'Le bien '.$id.' est archivé');

    // interpolation sur plusieurs lignes à une position (d) : une seule chaîne, un positif
    $payload = [
        'message' => "La période dépasse
            {$max} jours",
    ];

    // sprintf dans withMessages (e) : la phrase est imbriquée, le spécificateur ne compte pas
    throw ValidationException::withMessages([
        'to' => [sprintf('La plage ne peut dépasser %d jours.', $max)],
    ]);
}
