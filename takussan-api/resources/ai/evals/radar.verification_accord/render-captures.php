<?php

/**
 * TCK-2388 (décision 6, porteur 2026-10-28) — rend le jeu d'évaluation de `radar.verification_accord` : 15 captures
 * SYNTHÉTIQUES façon conversation WhatsApp (GD) et les 15 cas qui vont avec.
 *
 *   php resources/ai/evals/radar.verification_accord/render-captures.php --font=/chemin/vers/Police.ttf
 *
 * Depuis `takussan-api/`. La police est passée en argument : aucune police n'est versionnée (une TrueType avec les accents
 * français et « · » : Arial, DejaVu Sans…). Le rendu ne dépend de rien d'autre : ni horloge, ni hasard, ni base de
 * données ; mêmes entrées (script, clauses `accord.v1.fr.md`, police, GD/FreeType) → mêmes octets. Un autre FreeType ou
 * une autre police change les pixels, jamais les cas (`cases/*.json` ne dépendent pas de la police).
 *
 * Anonymat par construction : prénoms inventés, numéros fictifs en `+221 74 …`, préfixe que le plan de numérotage retenu
 * par `PhoneMasker` n'attribue pas (`7[0-25-9]`) — ni le numéro d'une personne réelle, ni un numéro que
 * `scripts/check-ai-evals-pii.mjs` signale.
 *
 * Le message envoyé de chaque cas est composé par `ConsentMessageComposer::compose('fr', …)` : le texte exact que le
 * produit enverrait, lien des conditions sur `https://takussan.com` (fixé ici, pas lu de l'environnement). Les
 * `*gras*` de WhatsApp sont rendus sans astérisques, comme l'écran de l'expéditeur.
 */

use App\Ai\Agents\RadarConsentVerification;
use App\Services\Radar\ConsentMessageComposer;
use Illuminate\Contracts\Console\Kernel;

require __DIR__.'/../../../../vendor/autoload.php';
$app = require __DIR__.'/../../../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
config(['app.frontend_url' => 'https://takussan.com']);

const WIDTH = 720;
const MARGIN = 16;
const BUBBLE_MAX = 560;
const PAD = 14;
const SIZE = 19;
const LINE = 28;

$font = null;
foreach (array_slice($argv, 1) as $arg) {
    if (str_starts_with($arg, '--font=')) {
        $font = substr($arg, 7);
    }
}
if ($font === null || ! is_file($font)) {
    fwrite(STDERR, "Usage : php render-captures.php --font=/chemin/vers/Police.ttf\n");
    exit(1);
}
if (! function_exists('imagettftext')) {
    fwrite(STDERR, "GD sans FreeType : rendu impossible.\n");
    exit(1);
}

$resume = 'vos annonces de location à Ouakam';

/**
 * `shown` : le numéro que l'en-tête de la conversation affiche ; `phone` : celui que la vérification attend, écrit
 * lisible ici et envoyé SANS espaces (E.164 compact, comme `$advertiser->phone` dans le job). `name` null : un
 * annonceur sans nom — l'en-tête n'affiche que le numéro, le message dit « Bonjour, » et l'entrée porte `inconnu`.
 * `message` : `full` (envoyé entier), `truncated` (capture coupée avant les clauses) ou `absent` (la capture ne montre
 * que la réponse). Attendus : ce que `fields.json` note.
 *
 * @var list<array{name: ?string, phone: string, shown?: string, message: string, reply: string, classification: string, number_matches: bool, clauses: list<int>}> $scenarios
 */
$scenarios = [
    // Accord (3)
    ['name' => 'Fatou', 'phone' => '+221 74 100 20 01', 'message' => 'full', 'reply' => 'OUI', 'classification' => 'consent', 'number_matches' => true, 'clauses' => [1, 2, 3, 4]],
    ['name' => 'Moussa', 'phone' => '+221 74 100 20 02', 'message' => 'full', 'reply' => "Oui d'accord", 'classification' => 'consent', 'number_matches' => true, 'clauses' => [1, 2, 3, 4]],
    ['name' => 'Mariama', 'phone' => '+221 74 100 20 03', 'message' => 'full', 'reply' => 'Ok vous pouvez', 'classification' => 'consent', 'number_matches' => true, 'clauses' => [1, 2, 3, 4]],
    // Refus (2)
    ['name' => 'Cheikh', 'phone' => '+221 74 100 20 04', 'message' => 'full', 'reply' => 'Non merci, je ne veux pas que mes annonces soient publiées.', 'classification' => 'refusal', 'number_matches' => true, 'clauses' => [1, 2, 3, 4]],
    ['name' => null, 'phone' => '+221 74 100 20 05', 'message' => 'full', 'reply' => 'Non, je préfère garder mes annonces pour moi', 'classification' => 'refusal', 'number_matches' => true, 'clauses' => [1, 2, 3, 4]],
    // STOP (2)
    ['name' => 'Ousmane', 'phone' => '+221 74 100 20 06', 'message' => 'full', 'reply' => 'STOP', 'classification' => 'stop', 'number_matches' => true, 'clauses' => [1, 2, 3, 4]],
    ['name' => 'Aissatou', 'phone' => '+221 74 100 20 07', 'message' => 'full', 'reply' => 'Stop svp, ne me contactez plus', 'classification' => 'stop', 'number_matches' => true, 'clauses' => [1, 2, 3, 4]],
    // Question (2)
    ['name' => 'Modou', 'phone' => '+221 74 100 20 08', 'message' => 'full', 'reply' => "C'est gratuit ? Il y a des frais ?", 'classification' => 'question', 'number_matches' => true, 'clauses' => [1, 2, 3, 4]],
    ['name' => 'Khady', 'phone' => '+221 74 100 20 09', 'message' => 'full', 'reply' => 'Qui êtes-vous ? Comment avez-vous eu mon numéro ?', 'classification' => 'question', 'number_matches' => true, 'clauses' => [1, 2, 3, 4]],
    // Ambigu (2)
    ['name' => 'Ibrahima', 'phone' => '+221 74 100 20 10', 'message' => 'full', 'reply' => "Peut-être, je dois d'abord en parler avec mon associé", 'classification' => 'ambiguous', 'number_matches' => true, 'clauses' => [1, 2, 3, 4]],
    ['name' => 'Rokhaya', 'phone' => '+221 74 100 20 11', 'message' => 'full', 'reply' => 'Hmm, je vais voir', 'classification' => 'ambiguous', 'number_matches' => true, 'clauses' => [1, 2, 3, 4]],
    // Numéro discordant (2) : l'en-tête montre un autre numéro, la réponse est « OUI » pour le premier, « Ok d'accord » pour le second
    ['name' => 'Seynabou', 'phone' => '+221 74 100 20 12', 'shown' => '+221 74 900 30 12', 'message' => 'full', 'reply' => 'OUI', 'classification' => 'consent', 'number_matches' => false, 'clauses' => [1, 2, 3, 4]],
    ['name' => 'Pape', 'phone' => '+221 74 100 20 13', 'shown' => '+221 74 900 30 13', 'message' => 'full', 'reply' => "Ok d'accord", 'classification' => 'consent', 'number_matches' => false, 'clauses' => [1, 2, 3, 4]],
    // Clauses absentes (2) : la capture ne montre que la réponse (« OUI » à on ne sait quoi : `ambiguous`), ou un message coupé avant les clauses (le début du message est visible : `consent`)
    ['name' => 'Binta', 'phone' => '+221 74 100 20 14', 'message' => 'absent', 'reply' => 'OUI', 'classification' => 'ambiguous', 'number_matches' => true, 'clauses' => []],
    ['name' => 'Alioune', 'phone' => '+221 74 100 20 15', 'message' => 'truncated', 'reply' => 'OUI', 'classification' => 'consent', 'number_matches' => true, 'clauses' => []],
];

$composer = $app->make(ConsentMessageComposer::class);
$clauseCount = $composer->clauseCount();
$dir = __DIR__;
@mkdir($dir.'/cases', 0777, true);
@mkdir($dir.'/captures', 0777, true);

/** Largeur d'un texte en pixels. */
$width = function (string $text) use ($font): int {
    $box = imagettfbbox(SIZE, 0, $font, $text);

    return (int) ($box[2] - $box[0]);
};

/**
 * Les lignes d'un texte dans une largeur : les sauts de ligne sont gardés, les mots se replient.
 *
 * @return list<string>
 */
$wrap = function (string $text, int $max) use ($width): array {
    $lines = [];
    foreach (explode("\n", $text) as $paragraph) {
        if (trim($paragraph) === '') {
            $lines[] = '';

            continue;
        }
        $line = '';
        foreach (explode(' ', $paragraph) as $word) {
            $try = $line === '' ? $word : $line.' '.$word;
            if ($line !== '' && $width($try) > $max) {
                $lines[] = $line;
                $line = $word;
            } else {
                $line = $try;
            }
        }
        $lines[] = $line;
    }

    return $lines;
};

foreach ($scenarios as $i => $scenario) {
    $n = sprintf('%03d', $i + 1);
    $first = $scenario['name'];
    $sent = $composer->compose('fr', $first === null ? 'Bonjour,' : "Bonjour {$first},", $resume);
    $shown = $scenario['shown'] ?? $scenario['phone'];

    // Ce que la capture montre du message : entier, coupé avant les clauses (salutation et présentation), ou rien.
    $visible = match ($scenario['message']) {
        'full' => $sent,
        'truncated' => implode("\n\n", array_slice(explode("\n\n", $sent), 0, 2)),
        default => null,
    };

    $bubbles = [];
    if ($visible !== null) {
        $bubbles[] = ['out', $wrap(str_replace('*', '', $visible), BUBBLE_MAX - 2 * PAD), '10:42'];
    }
    $bubbles[] = ['in', $wrap($scenario['reply'], BUBBLE_MAX - 2 * PAD), '10:47'];

    $header = 96;
    $height = $header + 60;
    foreach ($bubbles as [, $lines]) {
        $height += count($lines) * LINE + 2 * PAD + 22 + 14;
    }
    $height += 30;

    $image = imagecreatetruecolor(WIDTH, $height);
    $color = fn (int $r, int $g, int $b): int => (int) imagecolorallocate($image, $r, $g, $b);
    $chat = $color(0xE5, 0xDD, 0xD5);
    $green = $color(0x07, 0x5E, 0x54);
    $white = $color(0xFF, 0xFF, 0xFF);
    $outgoing = $color(0xDC, 0xF8, 0xC6);
    $ink = $color(0x11, 0x11, 0x11);
    $grey = $color(0x66, 0x70, 0x78);
    $chip = $color(0xF4, 0xEE, 0xD7);

    imagefilledrectangle($image, 0, 0, WIDTH, $height, $chat);
    imagefilledrectangle($image, 0, 0, WIDTH, $header, $green);
    imagefilledellipse($image, 56, 48, 56, 56, $color(0xB0, 0xBE, 0xC5));
    if ($first === null) {
        imagettftext($image, 22, 0, 96, 58, $white, $font, $shown);
    } else {
        imagettftext($image, 22, 0, 96, 44, $white, $font, $first);
        imagettftext($image, 15, 0, 96, 74, $color(0xCF, 0xE9, 0xE5), $font, $shown);
    }

    $label = "Aujourd'hui";
    imagefilledrectangle($image, (int) (WIDTH / 2 - 62), $header + 16, (int) (WIDTH / 2 + 62), $header + 46, $chip);
    imagettftext($image, 14, 0, (int) (WIDTH / 2 - 46), $header + 37, $grey, $font, $label);

    $y = $header + 66;
    foreach ($bubbles as [$side, $lines, $time]) {
        $inner = max(array_map($width, $lines));
        $bubbleWidth = min(BUBBLE_MAX, max($inner, 120) + 2 * PAD);
        $bubbleHeight = count($lines) * LINE + 2 * PAD + 22;
        $x = $side === 'out' ? WIDTH - MARGIN - $bubbleWidth : MARGIN;
        imagefilledrectangle($image, $x, $y, $x + $bubbleWidth, $y + $bubbleHeight, $side === 'out' ? $outgoing : $white);
        foreach ($lines as $k => $line) {
            imagettftext($image, SIZE, 0, $x + PAD, $y + PAD + 18 + $k * LINE, $ink, $font, $line);
        }
        imagettftext($image, 12, 0, $x + $bubbleWidth - 56, $y + $bubbleHeight - 8, $grey, $font, $time);
        $y += $bubbleHeight + 14;
    }

    // 64 couleurs suffisent à un texte lissé sur des aplats : les captures restent bien sous les 100 Ko.
    imagetruecolortopalette($image, false, 64);
    imagepng($image, "{$dir}/captures/{$n}.png", 9);

    $case = [
        'input' => RadarConsentVerification::input($sent, str_replace(' ', '', $scenario['phone']), $first, $clauseCount),
        'expected' => [
            'classification' => $scenario['classification'],
            'number_matches' => $scenario['number_matches'],
            'clauses_found' => $scenario['clauses'],
        ],
        'attachments' => ["captures/{$n}.png"],
    ];
    file_put_contents("{$dir}/cases/{$n}.json", json_encode($case, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n");
}

fwrite(STDOUT, count($scenarios)." cas écrits sous {$dir}\n");
