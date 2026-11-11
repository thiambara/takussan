<?php

/**
 * Fidélité au pixel (TCK-2684) — frappe les jetons Sanctum des personas de l'outil.
 *
 * Exécuté par `fidelite.mjs` via `php artisan tinker --execute "require '…/jetons.php';"`, jamais à
 * la main. Entrées par l'environnement : FIDELITE_COMPTES (JSON { persona: email }) et
 * FIDELITE_SORTIE (chemin du fichier de jetons, HORS du dépôt). Le fichier est créé en 0600 (umask
 * posé AVANT l'écriture) ; la sortie standard ne porte que des noms de personas, jamais un jeton.
 * Les jetons précédents de l'outil sont révoqués avant d'en frapper un neuf : ils ne s'accumulent
 * pas en base.
 */

use App\Models\User;

$comptes = json_decode((string) getenv('FIDELITE_COMPTES'), true) ?: [];
$sortie = (string) getenv('FIDELITE_SORTIE');
if ($sortie === '' || $comptes === []) {
    echo "jetons : FIDELITE_COMPTES et FIDELITE_SORTIE requis\n";

    return;
}
$existants = is_file($sortie) ? (json_decode((string) file_get_contents($sortie), true) ?: []) : [];
$frappes = [];
$absents = [];
foreach ($comptes as $persona => $email) {
    $user = User::query()->where('email', $email)->first();
    if ($user === null) {
        $absents[] = $persona;

        continue;
    }
    $user->tokens()->where('name', 'fidelite-pixel')->delete();
    $existants[$persona] = [
        'email' => $email,
        'token' => $user->createToken('fidelite-pixel', ['*'], now()->addDays(30))->plainTextToken,
    ];
    $frappes[] = $persona;
}
$ancien = umask(0077);
file_put_contents($sortie, json_encode($existants, JSON_PRETTY_PRINT));
umask($ancien);
chmod($sortie, 0600);
echo 'jetons frappés : ', implode(', ', $frappes) ?: '—', "\n";
if ($absents !== []) {
    echo 'comptes absents de la base : ', implode(', ', $absents), "\n";
}
