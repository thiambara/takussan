<?php

namespace App\Exceptions;

use App\Services\Auth\PhoneVerificationService;

/**
 * P15.05 (TCK-783) — aucun fournisseur n'a accepté le SMS qui portait un code à usage unique.
 *
 * Levée par {@see PhoneVerificationService} et rendue telle quelle : 503
 * `phone.sms_undelivered`, que l'écran affiche au lieu de « code envoyé ». Une classe à part, et
 * non `abort_code()`, pour que les deux appelants qui doivent rester muets la nomment dans leur
 * `catch` : la connexion par téléphone (elle ne dit rien de l'issue) et la confirmation d'une
 * alerte de recherche (un job, sans écran).
 */
class SmsCodeUndelivered extends ApiError
{
    public function __construct()
    {
        parent::__construct(503, 'phone.sms_undelivered');
    }
}
