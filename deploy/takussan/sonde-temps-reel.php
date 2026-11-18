<?php

/**
 * TCK-2956 — la sonde du temps réel de la pile, jouée DANS le conteneur `api` par smoke-api.sh :
 *
 *   php sonde-temps-reel.php origine <Origin>   # la première trame du serveur pour cette origine
 *   php sonde-temps-reel.php signal <Origin>    # s'abonne à private-utilisateur.<id>, émet par l'émetteur
 *                                               #   de l'API (TempsReel::signalerA), attend le signal
 *
 * Elle lit ce que lit l'API : `REVERB_HOST` et `REVERB_PORT` (écrits par compose.api.yml, l'alias du Reverb de
 * la pile), `REVERB_APP_KEY` et `REVERB_APP_SECRET` (le `.env`). Le client WebSocket est écrit à la main, sans
 * dépendance : l'image n'a ni Node ni client WebSocket PHP, et le navigateur ENVOIE un en-tête Origin, que le
 * WebSocket natif de Node n'envoie pas. L'abonnement est signé ici, avec le secret, comme le ferait
 * `/api/broadcasting/auth` : c'est l'accord du secret entre l'API et le serveur qu'il éprouve, pas l'autorisation
 * des canaux (tests/Feature/TempsReel).
 *
 * Sortie : une ligne par trame reçue ; code 0 si l'attendu est arrivé, 1 sinon. Aucune clé n'est imprimée.
 */

declare(strict_types=1);
use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\TempsReel;
use Illuminate\Contracts\Console\Kernel;

[$mode, $origine] = [$argv[1] ?? '', $argv[2] ?? ''];
$hote = (string) getenv('REVERB_HOST');
$port = (int) (getenv('REVERB_PORT') ?: 8080);
$cle = (string) getenv('REVERB_APP_KEY');
$secret = (string) getenv('REVERB_APP_SECRET');
if (! in_array($mode, ['origine', 'signal'], true) || $origine === '' || $hote === '' || $cle === '') {
    fwrite(STDERR, "usage : php sonde-temps-reel.php origine|signal <Origin> (REVERB_HOST et REVERB_APP_KEY requises)\n");
    exit(2);
}

$flux = @stream_socket_client("tcp://{$hote}:{$port}", $errno, $errstr, 5);
if ($flux === false) {
    fwrite(STDERR, "✗ {$hote}:{$port} injoignable : {$errstr}\n");
    exit(1);
}
stream_set_timeout($flux, 5);
$nonce = base64_encode(random_bytes(16));
fwrite($flux, "GET /app/{$cle}?protocol=7&client=sonde&version=1 HTTP/1.1\r\nHost: {$hote}:{$port}\r\n"
    ."Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {$nonce}\r\nSec-WebSocket-Version: 13\r\n"
    ."Origin: {$origine}\r\n\r\n");
$entete = '';
while (! str_contains($entete, "\r\n\r\n") && ($ligne = fgets($flux)) !== false) {
    $entete .= $ligne;
}
if (! str_starts_with($entete, 'HTTP/1.1 101')) {
    fwrite(STDERR, '✗ pas de mise à niveau WebSocket : '.strtok($entete, "\r\n")."\n");
    exit(1);
}

/** Une trame du serveur (jamais masquée) ; null à la fermeture ou à l'échéance. */
$lire = function () use ($flux): ?string {
    while (true) {
        $tete = fread($flux, 2);
        if ($tete === false || strlen($tete) < 2) {
            return null;
        }
        $code = ord($tete[0]) & 0x0F;
        $longueur = ord($tete[1]) & 0x7F;
        if ($longueur === 126) {
            $longueur = unpack('n', fread($flux, 2))[1];
        } elseif ($longueur === 127) {
            $longueur = unpack('J', fread($flux, 8))[1];
        }
        $charge = '';
        while (strlen($charge) < $longueur && ($bout = fread($flux, $longueur - strlen($charge))) !== false && $bout !== '') {
            $charge .= $bout;
        }
        if ($code === 0x8) {
            return null;
        }
        if ($code === 0x1) {
            return $charge;
        }
    }
};
/** Une trame texte du client, masquée comme l'exige la RFC 6455. */
$ecrire = function (string $texte) use ($flux): void {
    $masque = random_bytes(4);
    $n = strlen($texte);
    $tete = chr(0x81).($n < 126 ? chr(0x80 | $n) : chr(0x80 | 126).pack('n', $n));
    $masquee = '';
    for ($i = 0; $i < $n; $i++) {
        $masquee .= $texte[$i] ^ $masque[$i % 4];
    }
    fwrite($flux, $tete.$masque.$masquee);
};

$premiere = $lire();
echo "{$origine} → ".($premiere ?? '(fermé)')."\n";
$evenement = json_decode((string) $premiere, true);
if (($evenement['event'] ?? null) !== 'pusher:connection_established') {
    exit(1);
}
if ($mode === 'origine') {
    exit(0);
}

$idSocket = json_decode($evenement['data'], true)['socket_id'];
$utilisateur = random_int(900000, 999999);
$canal = "private-utilisateur.{$utilisateur}";
$ecrire(json_encode(['event' => 'pusher:subscribe', 'data' => [
    'channel' => $canal,
    'auth' => $cle.':'.hash_hmac('sha256', "{$idSocket}:{$canal}", $secret),
]]));
$trame = $lire();
echo 'abonnement → '.($trame ?? '(fermé)')."\n";
if (($trame === null) || ! str_contains($trame, 'pusher_internal:subscription_succeeded')) {
    exit(1);
}

// L'émetteur de l'API, avec SA configuration (mise en cache par l'entrypoint) : son transport, sa clé, son hôte.
require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
TempsReel::signalerA($utilisateur, CodeDeSignal::NotificationsUpdated);

while (($trame = $lire()) !== null) {
    echo "reçu → {$trame}\n";
    if (str_contains($trame, 'notifications.updated') && str_contains($trame, $canal)) {
        exit(0);
    }
}
fwrite(STDERR, "✗ aucun signal reçu sur {$canal}\n");
exit(1);
