<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Authentication Language Lines (FR)
|--------------------------------------------------------------------------
|
| TCK-175 — l'app doit rester en français pour l'utilisateur connecté.
| Sans ce fichier, Laravel servait la version EN par défaut (notamment
| la clé `throttle` ressortait sous `Too Many Attempts.` côté toast UI).
|
*/

return [
    'failed' => 'Ces identifiants ne correspondent pas.',
    'password' => 'Le mot de passe fourni est incorrect.',
    'throttle' => 'Trop de tentatives. Réessayez dans :seconds secondes.',
    'registration_successful' => 'Inscription réussie. Veuillez vérifier votre adresse e-mail.',
    'logout_successful' => 'Déconnexion réussie.',
    'two_factor_required' => 'Authentification à deux facteurs requise.',
    'two_factor_invalid' => 'Code à deux facteurs ou code de récupération invalide.',
    // TCK-589 — entrée par téléphone, verrou, sessions, 2FA exigée (ajouts seulement).
    'phone' => [
        'sms_code' => 'Takussan : votre code est :code. Il expire dans :minutes min. Ne le communiquez à personne.',
        'taken' => 'Ce numéro est déjà vérifié sur un autre compte.',
        'code_invalid' => 'Code invalide ou expiré.',
        'already_verified' => 'Ce numéro est déjà vérifié.',
        'missing' => 'Aucun numéro de téléphone enregistré.',
        'resend_wait' => 'Patientez avant de demander un nouveau code.',
        'code_sent' => 'Si ce numéro peut recevoir un SMS, un code vient d\'y être envoyé.',
        'deletion_code' => 'Takussan : code de confirmation de suppression de compte :code. Il expire dans :minutes min.',
    ],
    'oauth' => [
        'challenge_invalid' => 'Ce défi de connexion a expiré ou a déjà servi. Reconnectez-vous.',
    ],
    'account' => [
        'blocked' => 'Ce compte est bloqué.',
        'locked' => 'Trop de tentatives échouées. Le compte est verrouillé pour quelques minutes.',
    ],
    'two_factor' => [
        'required' => 'Activez la double authentification pour continuer : vous touchez à une opération sensible.',
        'step_up_required' => 'Confirmez avec votre code de double authentification pour continuer.',
        'step_up_invalid' => 'Code de double authentification invalide.',
        'mandatory' => 'La double authentification est obligatoire pour votre compte : elle se renouvelle, elle ne se désactive pas.',
        'not_enabled' => 'La double authentification n\'est pas activée.',
        'renewal_missing' => 'Commencez par générer un nouveau secret (renouvellement de l\'appareil).',
    ],
];
