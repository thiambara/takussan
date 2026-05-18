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
];
