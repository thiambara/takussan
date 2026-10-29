<?php

namespace App\Support;

/**
 * TCK-2383 (ADR-0076 §5) — masque les numéros d'un texte : les sénégalais, avec ou sans `+221`, `00221`
 * ou `221` nu, collés ou groupés (`77 123 45 67`, `77 12 34 567`, `338 21 00 00`, `77/123/45/67`…)
 * par espaces, espaces insécables, points, tirets ou barres obliques.
 *
 * Préfixes (TCK-2400) : ceux du plan de numérotage national de l'ARTP, communication du 6.IX.2022
 * publiée par l'UIT le 3.X.2023 (Bulletin d'exploitation, « Sénégal (indicatif de pays +221) ») —
 * fixe 30, 32, 33, 36, 39 ; mobile 70, 72, 75, 76, 77, 78, 79 ; VoIP 93. Plus 71, ajouté sur
 * décision du porteur (2026-10-27) bien que ce plan ne l'attribue pas encore. 34 n'y est pas.
 *
 * Avant le motif, les chiffres pleine chasse et arabes-indiens sont ramenés à l'ASCII et les
 * caractères invisibles (U+200B…) retirés, un code point pour un code point : le texte rendu garde
 * tout ce qui n'est pas un numéro. Un nombre suivi d'une marque monétaire (`F`, `FCFA`, `F CFA`,
 * `CFA`, `XOF`, `francs`) est un prix, pas un numéro ; un groupement 3-3-3 (`300 000 000`) aussi.
 *
 * **Les numéros étrangers** (TCK-2410, `MASK_PATTERN`) : `+` ou `00` et un indicatif ITU (`+33 6 12 34 56 78`,
 * `+225 07 12 34 56 78`, `+ 33 …`, `(0)`), ou la forme nationale `0X XX XX XX XX`. `PATTERN` reste le numéro
 * sénégalais seul : `RadarPhone` et `RadarAmountParser` le lisent, et un numéro étranger n'est pas un contact
 * du Radar. Un numéro réel ne s'écrit dans aucun document du dépôt : voir `scripts/check-ai-evals-pii.mjs`.
 *
 * `scripts/check-ai-evals-pii.mjs` reconnaît le même ensemble : `tests/fixtures/ai/donnees-personnelles.json`
 * éprouve les deux. Le jeton n'est pas un numéro plausible.
 * Échoue fermé : sur une erreur PCRE (UTF-8 invalide) il purge puis relance, et lève plutôt que de rendre le texte brut.
 */
final class PhoneMasker
{
    private const SEP = '[\s\x{00A0}\x{202F}.\-\/]';

    private const PREFIX = '(?:3[02369]|7[0-25-9]|93)';

    /** Fin commune : pas de chiffre derrière, et un nombre suivi d'une marque monétaire est un prix. */
    private const END = '(?!\d)(?![\s\x{00A0}\x{202F}]*(?:f[\s\x{00A0}\x{202F}]?cfa|cfa|xof|francs?|f)(?!\p{L}))';

    private const SENEGAL = '(?<!\d)(?:(?:\+|00)?221'.self::SEP.'?)?'
        .'(?:'.self::PREFIX.self::SEP.'?(?:\d{3}'.self::SEP.'?\d{2}'.self::SEP.'?\d{2}|\d{2}'.self::SEP.'?\d{2}'.self::SEP.'?\d{3})'
        .'|'.self::PREFIX.'\d'.self::SEP.'?\d{2}'.self::SEP.'?\d{2}'.self::SEP.'?\d{2})';

    /**
     * Indicatifs ITU (E.164) par longueur : le `+` ou `00` qui les précède ne suffit pas, `+ 1 000 000`
     * n'est pas un numéro. Chaque jeu est suivi du nombre de chiffres que son plan de numérotation
     * admet (neuf à treize chiffres au total) : un indicatif à un chiffre veut 10 chiffres derrière
     * (plan nord-américain et russe), à deux 7 à 11, à trois 6 à 10. La France (+33, 9 chiffres) a sa
     * longueur exacte et passe d'abord : un groupe qui suit un numéro (`+33 6 12 34 56 78 15 chambres`) ne s'y ajoute pas.
     *
     * `+221` n'y est pas : un numéro sénégalais se reconnaît à ses préfixes (`PATTERN`), et `+221 74 …`,
     * préfixe que le plan n'attribue pas, est ce que les jeux d'évaluation écrivent pour un numéro fictif.
     */
    /** Après l'indicatif : le `)` de `(+33)`, puis le `(0)` de trunk. */
    private const AFTER_CC = '\)?(?:[\s\x{00A0}\x{202F}]?\(0\))?';

    private const CC1 = '[17]';

    private const CC2 = '(?:2[07]|3[0-469]|4[013-9]|5[1-8]|6[0-6]|8[1246]|9[0-58])';

    private const CC3 = '(?:21[1-368]|22[02-9]|23\d|24\d|25[0-8]|26\d|29[01789]|35\d|37\d|38[0-35-79]|42[013]|50\d|59\d|6[78]\d|69[0-2]|85[02356]|880|886|96[0-8]|97[0-7]|99[2-8])';

    /**
     * Un numéro étranger (TCK-2410) : `+` (une espace tolérée derrière) ou `00`, un indicatif ITU, puis
     * les chiffres, séparés par au plus deux caractères (espace, point, tiret, barre oblique). Après
     * l'indicatif, trois parenthèses seulement : `(+33) 6 …`, le `(0)` de `+33 (0)6 …` (il compte pour
     * un chiffre), et la zone de `+1 (202) 555 0123`. Ailleurs `(` coupe le numéro : `ADR-0064 (2026-10-14)`
     * n'est pas un `00` + indicatif 64. Il ne finit jamais sur un chiffre seul séparé du reste
     * (`… 56 78 3 chambres` : le `3` n'est pas au numéro).
     *
     * Ou, sans indicatif, la forme nationale française et ivoirienne `0X XX XX XX XX`, collée ou séparée
     * à chaque paire **par le même caractère** : `01.05.2026 12 h`, ou `load averages: 44.07 87.79 75.17`,
     * n'en sont pas.
     *
     * Pas d'exclusion des montants ici, contrairement au numéro sénégalais : un nombre précédé de `+` et
     * d'un indicatif, ou qui commence par 0 et compte dix chiffres, n'est pas un prix, et l'exclusion
     * ferait reculer le motif d'un groupe (`+33 6 12 34 56 78 F. Dupont` laisserait `78 F.`).
     */
    private const FOREIGN = '(?:(?<![\d+])(?:\+[\s\x{00A0}\x{202F}]?|00'.self::SEP.'?)(?:'
        .'33'.self::AFTER_CC.'(?:'.self::SEP.'{0,2}\d){9}'
        .'|'.self::CC1.self::AFTER_CC.'(?:'.self::SEP.'?\(\d{3}\)(?:'.self::SEP.'{0,2}\d){7}|(?:'.self::SEP.'{0,2}\d){10})'
        .'|'.self::CC2.self::AFTER_CC.'(?:'.self::SEP.'{0,2}\d){7,11}'
        .'|'.self::CC3.self::AFTER_CC.'(?:'.self::SEP.'{0,2}\d){6,10}'
        .')(?<!'.self::SEP.'\d)'
        .'|(?<!\d)0[1-9](?:\d{8}|(?<sep>'.self::SEP.')\d{2}(?:\k<sep>\d{2}){3}))(?!\d)';

    /**
     * Le numéro SÉNÉGALAIS, rien d'autre : `RadarPhone` et `RadarAmountParser` s'y fient (un numéro
     * étranger n'est pas un contact du Radar). S'applique au texte normalisé (`normalizeDigits()`, sans
     * invisibles). Un séparateur facultatif entre les groupes 2-3-2-2, 2-2-2-3 ou 3-2-2-2 :
     * `750 000 000` (3-3-3) n'en est aucun.
     */
    public const PATTERN = '/'.self::SENEGAL.self::END.'/iu';

    /**
     * Ce que le masquage et la garde des jeux d'évaluation reconnaissent : un numéro sénégalais OU un
     * numéro étranger (TCK-2410). Le sénégalais passe en premier : `+221 77 …` est un seul numéro.
     */
    public const MASK_PATTERN = '/(?:'.self::SENEGAL.self::END.'|'.self::FOREIGN.')/iu';

    public const TOKEN = '[TELEPHONE]';

    /** Retirés avant le motif : « 77<ZWSP>123 45 67 » est un numéro. */
    public const INVISIBLE = '/[\x{200B}\x{200C}\x{200D}\x{2060}\x{FEFF}\x{00AD}]/u';

    /** Premier code point de chaque série de chiffres non ASCII ramenée à 0-9. */
    private const DIGIT_ZEROS = [0xFF10, 0x0660, 0x06F0];

    /** @var array<string, string>|null */
    private static ?array $digits = null;

    public static function mask(string $text): string
    {
        return self::maskValid($text) ?? self::maskValid(mb_scrub($text, 'UTF-8')) ?? throw new \RuntimeException('ai.phone_mask_failed');
    }

    /** Les chiffres pleine chasse et arabes-indiens en ASCII, un code point pour un code point. */
    public static function normalizeDigits(string $text): string
    {
        if (self::$digits === null) {
            self::$digits = [];
            foreach (self::DIGIT_ZEROS as $zero) {
                for ($i = 0; $i <= 9; $i++) {
                    self::$digits[mb_chr($zero + $i, 'UTF-8')] = (string) $i;
                }
            }
        }

        return strtr($text, self::$digits);
    }

    /** Null si le texte n'est pas de l'UTF-8 valide ou si PCRE échoue. */
    private static function maskValid(string $text): ?string
    {
        $chars = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY);
        if ($chars === false) {
            return null;
        }
        // Le texte normalisé, et pour chacun de ses code points l'indice du caractère d'origine.
        $normalized = '';
        $map = [];
        foreach ($chars as $index => $char) {
            if (preg_match(self::INVISIBLE, $char) === 1) {
                continue;
            }
            $normalized .= self::normalizeDigits($char);
            $map[] = $index;
        }
        if (preg_match_all(self::MASK_PATTERN, $normalized, $found, PREG_OFFSET_CAPTURE) === false) {
            return null;
        }

        $out = '';
        $cursor = 0;
        foreach ($found[0] as [$match, $byte]) {
            $first = mb_strlen(substr($normalized, 0, $byte), 'UTF-8');
            $start = $map[$first];
            $end = $map[$first + mb_strlen($match, 'UTF-8') - 1];
            $out .= implode('', array_slice($chars, $cursor, $start - $cursor)).self::TOKEN;
            $cursor = $end + 1;
        }

        return $out.implode('', array_slice($chars, $cursor));
    }
}
