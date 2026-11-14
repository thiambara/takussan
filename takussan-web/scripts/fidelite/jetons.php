<?php

/**
 * Fidélité au pixel (TCK-2684) — frappe les jetons Sanctum des personas de l'outil.
 *
 * Exécuté par `fidelite.mjs` via `php artisan tinker --execute "require '…/jetons.php';"`, jamais à
 * la main. Entrées par l'environnement : FIDELITE_COMPTES (JSON { persona: email }),
 * FIDELITE_INVITATIONS (JSON { persona invitée: email }, facultatif — TCK-2798) et FIDELITE_SORTIE
 * (chemin du fichier de jetons, HORS du dépôt). Le fichier est créé en 0600 (umask posé AVANT
 * l'écriture) ; la sortie standard ne porte que des noms de personas, jamais un jeton.
 *
 * Les jetons précédents de l'outil sont révoqués avant d'en frapper un neuf, pour les SEULS comptes
 * demandés : ils ne s'accumulent pas en base. Le fichier est partagé par les agents (TCK-2798) : il
 * est relu SOUS VERROU juste avant l'écriture, seules les entrées frappées ici y changent, et il est
 * remplacé d'un bloc (fichier temporaire puis `rename`) — un appel concurrent n'y perd rien.
 *
 * Une persona invitée n'a pas de compte : on relit le jeton de son invitation encore utilisable
 * (`sent`, non expirée), semée par `PersonasDeFideliteSeeder`.
 */

use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\User;

$comptes = json_decode((string) getenv('FIDELITE_COMPTES'), true) ?: [];
$invitations = json_decode((string) getenv('FIDELITE_INVITATIONS'), true) ?: [];
$sortie = (string) getenv('FIDELITE_SORTIE');
if ($sortie === '' || ($comptes === [] && $invitations === [])) {
    echo "jetons : FIDELITE_COMPTES (ou FIDELITE_INVITATIONS) et FIDELITE_SORTIE requis\n";

    return;
}

$entrees = [];
$frappes = [];
$absents = [];
foreach ($comptes as $persona => $email) {
    $user = User::query()->where('email', $email)->first();
    if ($user === null) {
        $absents[] = $persona;

        continue;
    }
    $user->tokens()->where('name', 'fidelite-pixel')->delete();
    $entrees[$persona] = [
        'email' => $email,
        'token' => $user->createToken('fidelite-pixel', ['*'], now()->addDays(30))->plainTextToken,
    ];
    $frappes[] = $persona;
}

$relues = [];
$sansInvitation = [];
foreach ($invitations as $persona => $email) {
    $invitation = Invitation::query()
        ->where('email', $email)
        ->where('status', InvitationStatus::Sent->value)
        ->where('expires_at', '>', now())
        ->orderByDesc('id')
        ->first();
    if ($invitation === null) {
        $sansInvitation[] = $persona;

        continue;
    }
    $entrees[$persona] = ['email' => $email, 'invitation' => $invitation->token];
    $relues[] = $persona;
}

$ancien = umask(0077);
$verrou = fopen($sortie.'.verrou', 'c');
flock($verrou, LOCK_EX);
try {
    $existants = is_file($sortie) ? (json_decode((string) file_get_contents($sortie), true) ?: []) : [];
    $temporaire = $sortie.'.'.getmypid().'.tmp';
    file_put_contents($temporaire, json_encode([...$existants, ...$entrees], JSON_PRETTY_PRINT));
    chmod($temporaire, 0600);
    rename($temporaire, $sortie);
} finally {
    flock($verrou, LOCK_UN);
    fclose($verrou);
    umask($ancien);
}

echo 'jetons frappés : ', implode(', ', $frappes) ?: '—', "\n";
if ($absents !== []) {
    echo 'comptes absents de la base : ', implode(', ', $absents), "\n";
}
if ($invitations !== []) {
    echo 'invitations relues : ', implode(', ', $relues) ?: '—', "\n";
}
if ($sansInvitation !== []) {
    echo 'invitations absentes (aucune encore utilisable) : ', implode(', ', $sansInvitation), "\n";
}
