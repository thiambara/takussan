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
 * sénégalais seul : `RadarPhone::canonical()` s'y fie, et un numéro étranger n'est pas un contact du Radar
 * (TCK-2412 : `fromText()` et `RadarAmountParser` lisent `MASK_PATTERN`, puis écartent ou excluent).
 * Un numéro réel ne s'écrit dans aucun document du dépôt : voir `scripts/check-ai-evals-pii.mjs`.
 *
 * `scripts/check-ai-evals-pii.mjs` reconnaît le même ensemble : `tests/fixtures/ai/donnees-personnelles.json`
 * éprouve les deux. Le jeton n'est pas un numéro plausible.
 * Échoue fermé : sur une erreur PCRE (UTF-8 invalide) il purge puis relance, et lève plutôt que de rendre le texte brut.
 */
final class PhoneMasker
{
    /**
     * Les espaces de Unicode, énumérées : `\s` n'a pas le même contenu sous PCRE (U+0085 en plus) et en JavaScript,
     * et la garde JS doit lire le même ensemble (`scripts/check-ai-evals-pii.mjs`).
     */
    private const WSI = '\x{09}-\x{0D}\x{20}\x{85}\x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}';

    private const WS = '['.self::WSI.']';

    /** Un séparateur : une espace, un point, une barre oblique ou un tiret (`-`, demi-cadratin `–`, moins `−`…). */
    private const SEP = '['.self::WSI.'.\-\/\x{2010}-\x{2015}\x{2212}]';

    private const PREFIX = '(?:3[02369]|7[0-25-9]|93)';

    /** Le préfixe d'un numéro sénégalais dont les deux chiffres peuvent être séparés : `7 7 1 2 3 …`. */
    private const PREFIX_SPACED = '(?:3'.self::SEP.'?[02369]|7'.self::SEP.'?[0-25-9]|9'.self::SEP.'?3)';

    /** Fin commune : pas de chiffre derrière, et un nombre suivi d'une marque monétaire est un prix. */
    private const END = '(?![0-9])(?!'.self::WS.'*(?:f'.self::WS.'?cfa|cfa|xof|francs?|f)(?!\p{L}))';

    private const SENEGAL = '(?<![0-9])(?:(?:\+|00)?221'.self::SEP.'?)?'
        .'(?:'.self::PREFIX.self::SEP.'?(?:[0-9]{3}'.self::SEP.'?[0-9]{2}'.self::SEP.'?[0-9]{2}|[0-9]{2}'.self::SEP.'?[0-9]{2}'.self::SEP.'?[0-9]{3})'
        .'|'.self::PREFIX.'[0-9]'.self::SEP.'?[0-9]{2}'.self::SEP.'?[0-9]{2}'.self::SEP.'?[0-9]{2})';

    /**
     * Le numéro sénégalais PRÉCÉDÉ de son indicatif écrit `+221` ou `00221` : les neuf chiffres peuvent alors
     * se grouper comme on veut (`+221 771 234 567`, `+221 77 12 345 67`, `+221 7 7 1 2 3 4 5 6 7`), et une
     * lettre `F` derrière n'en fait pas un prix. Préfixes de l'ARTP seulement : `+221 74 …` reste le fictif.
     */
    private const SENEGAL_WITH_CODE = '(?<![0-9])(?:\+'.self::WS.'{0,2}|00'.self::WS.'?)221'.self::AFTER_CC.self::SEP.'{0,3}'
        .self::PREFIX_SPACED.'(?:'.self::SEP.'{0,3}[0-9]){7}(?![0-9])';

    /**
     * Le numéro sénégalais SANS indicatif, à groupement libre, séparé par des espaces : le préfixe d'un seul tenant,
     * puis sept chiffres groupés comme on veut (`77 1234567`, `77 1 23 45 67`, `77 12 345 67`, `33 8 21 00 00`) ;
     * ou, le préfixe espacé (`7 7 …`), la forme stricte « neuf chiffres un à un » (`7 7 1 2 3 4 5 6 7`).
     * Ni une date `30/12/2026` ou `30 1 2026`, ni trois zéros d'affilée (`750000 000`), ni deux groupes de
     * mille en fin, écartés d'une ou deux espaces (`750 000 000`, `33 3 333 333` : le 3-3-3 y est compris), ni un chiffre isolé derrière la forme
     * stricte (`7 1 2 3 4 5 6 7 8 9`, une liste). Pas de tiret ni de barre : `30-31-32-33-4`, `30-20-15-10-5` sont
     * des listes. Limites : `3 2 1 0 9 8 7 6 5` (une liste décroissante) et `7 7 5 0 0 0 0 0 0` sont masqués.
     */
    private const SENEGAL_LOOSE = '(?<![0-9])'
        .'(?![0-9]{2}'.self::SEP.'[0-9]{1,2}'.self::SEP.'[0-9]{4}(?![0-9]))'
        .'(?!(?:[0-9]'.self::SEP.'?){0,8}000)'
        .'(?:'.self::PREFIX.'(?:'.self::WS.'{0,2}[0-9]){7}(?<!'.self::WS.'[0-9]{3}'.self::WS.'{1,2}[0-9]{3})'
        .'|(?:3'.self::WS.'[02369]|7'.self::WS.'[0-25-9]|9'.self::WS.'3)(?:'.self::WS.'[0-9]){7}(?!'.self::WS.'[0-9](?![0-9])))';

    /**
     * Le numéro sénégalais sans indicatif écrit avec un `_` ou une `,` (`77_123_45_67`, `77,123,45,67`), ou avec
     * le préfixe entre parenthèses (`(77)1234567`, `(77) 123 45 67`). Le séparateur est le même partout et le
     * groupement n'est jamais en milliers (3-2-2, 2-3-2, 2-2-3 derrière le préfixe) : `1,500,000`, `75,000,000`
     * et `7,5 millions` ne sont pas ces formes. La virgule ne vaut que si un groupe de trois chiffres est en deuxième
     * ou troisième place : `30,59,80,102` et `72,73,74,814` sont des listes de lignes (le 2-2-2-3 n'est lu qu'avec `_`).
     * Pas de chiffre derrière (`77,123,45,67,89` est une liste), ni
     * de décimale ou de liste devant. Limite : un séparateur mêlé (`77_123 45,67`).
     */
    private const SENEGAL_SEPARATED = '(?<![0-9])(?<![0-9][.,_])(?:'
        .self::PREFIX.'(?:(?<sep2>[_,])(?:[0-9]{3}\k<sep2>[0-9]{2}\k<sep2>[0-9]{2}|[0-9]{2}\k<sep2>[0-9]{3}\k<sep2>[0-9]{2})'
        .'|_[0-9]{2}_[0-9]{2}_[0-9]{3})(?![0-9])(?![,._][0-9])'
        .'|\('.self::PREFIX.'\)'.self::WS.'?(?:[0-9]{7}|[0-9]{3}'.self::WS.'?[0-9]{2}'.self::WS.'?[0-9]{2}'
        .'|[0-9]{2}'.self::WS.'?[0-9]{3}'.self::WS.'?[0-9]{2}|[0-9]{2}'.self::WS.'?[0-9]{2}'.self::WS.'?[0-9]{3})(?![0-9]))';

    /**
     * Indicatifs ITU (E.164) par longueur : le `+` ou `00` qui les précède ne suffit pas, `+ 1 000 000`
     * n'est pas un numéro. Chaque jeu est suivi du nombre de chiffres que son plan de numérotation
     * admet (neuf à treize chiffres au total) : un indicatif à un chiffre veut 10 chiffres derrière
     * (plan nord-américain et russe), à deux 7 à 11, à trois 6 à 10. La France (+33, 9 chiffres) a sa
     * longueur exacte et passe d'abord : un groupe qui suit un numéro (`+33 6 12 34 56 78 15 chambres`)
     * ne s'y ajoute pas.
     *
     * `+221` n'y est pas : un numéro sénégalais se reconnaît à ses préfixes, et `+221 74 …`, préfixe que
     * le plan n'attribue pas, est ce que les jeux d'évaluation écrivent pour un numéro fictif.
     */
    private const CC1 = '[17]';

    private const CC2 = '(?:2[07]|3[0-469]|4[013-9]|5[1-8]|6[0-6]|8[1246]|9[0-58])';

    private const CC3 = '(?:21[1-368]|22[02-9]|2[34][0-9]|25[0-8]|26[0-9]|29[01789]|35[0-9]|37[0-9]|38[0-35-79]|42[013]|50[0-9]|59[0-9]|6[78][0-9]|69[0-2]|85[02356]|880|886|96[0-8]|97[0-7]|99[2-8])';

    /**
     * Après l'indicatif : le `)` de `(+33)`, puis le `(0)` de trunk — et pas la forme d'un montant. Collé au
     * `+`, deux groupes `000` à la fin, tous les groupes de trois chiffres (`frais +225 000 000`,
     * `+45 000 000 000 F`) ; `+224 622 000 000` en a la forme : limite, et `+225 27 20 000 000` ou
     * `+212 522 123 000` non. Espacé du `+` (`+ 250 000 000`, `+ 223 500 000`), un seul groupe `000` suffit :
     * c'est le `(?!…)` du `+`, dans `FOREIGN`.
     */
    private const AFTER_CC = '\)?(?:'.self::WS.'?\(0\))?(?!'.self::SEP.'?[0-9]{0,3}(?:'.self::SEP.'[0-9]{3})*'.self::SEP.'000'.self::SEP.'000(?![0-9]))';

    /**
     * TCK-2428 — le `+` de l'étage d'une annonce (`R+1`, `R+10` : rez-de-chaussée plus un, plus dix) n'est pas un
     * indicatif : `Immeuble R+1 1 250 500 750 F` perdait son prix (`+1` et dix chiffres), `Immeuble R+10 77 123 45 67`
     * se lisait `+10…`. Un `R` isolé, le `+`, un étage de 0 à 19 que rien ne colle derrière : aucun indicatif à deux ou
     * trois chiffres ne commence par 1, donc `R+44 7700 900123` reste un numéro. Collé à un mot (`Tel+33 …`, `Mr+33 …`),
     * suivi d'une espace (`R+ 33 …`) ou d'un numéro collé (`R+33612345678`), le `+` reste un indicatif — plus étroit que
     * `RadarPhone::withoutFloorPlus()`, qui n'a pas de numéro étranger à rendre. Limite assumée : `R+1 202 555 0123`
     * et `R+7 912 345 67 89` (indicatif d'un chiffre derrière un `R`) s'écrivent comme un étage.
     *
     * TCK-2435 — l'étage s'écrit aussi `RDC+1` (rez-de-chaussée plus un) et `R + 1`, `R +1`, `R+ 1` : au plus deux espaces
     * de chaque côté du `+`, le même étage de 0 à 19. `R + 33 6 12 34 56 78`, `RDC+33612345678`, `RDC+44 7700 900123`
     * restent des numéros ; la limite d'un indicatif d'un chiffre s'étend à ces écritures (`RDC+1 202 555 0123`).
     * Le mot de l'étage est énuméré branche par branche : un lookbehind PCRE n'admet que des branches de longueur fixe.
     */
    private const FLOOR_WORD = '(?<=(?<!\p{L})r|(?<!\p{L})rdc'
        .'|(?<!\p{L})r'.self::WS.'|(?<!\p{L})rdc'.self::WS
        .'|(?<!\p{L})r'.self::WS.self::WS.'|(?<!\p{L})rdc'.self::WS.self::WS.')';

    private const NOT_A_FLOOR = '(?!'.self::FLOOR_WORD.'\+'.self::WS.'{0,2}(?:[0-9]|1[0-9])(?![0-9]))';

    /**
     * Un numéro étranger (TCK-2410) : `+` (une espace tolérée derrière) ou `00`, un indicatif ITU, puis
     * les chiffres, séparés par au plus trois caractères (espace, point, tiret, barre oblique). Après
     * l'indicatif, trois parenthèses seulement : `(+33) 6 …`, le `(0)` de `+33 (0)6 …` (il compte pour
     * un chiffre), et la zone de `+1 (202) 555 0123`. Ailleurs `(` coupe le numéro : `ADR-0064 (2026-10-14)`
     * n'est pas un `00` + indicatif 64. Il ne finit jamais sur un chiffre seul séparé du reste
     * (`… 56 78 3 chambres` : le `3` n'est pas au numéro) ; `+ 250 000 000`, `frais +225 000 000` sont
     * des sommes, pas des numéros (voir `AFTER_CC`).
     *
     * Ou, sans indicatif, la forme nationale française et ivoirienne `0X XX XX XX XX`, collée ou séparée
     * à chaque paire **par le même caractère** : `01.05.2026 12 h`, ou `load averages: 44.07 87.79 75.17`,
     * n'en sont pas.
     *
     * Pas d'exclusion « marque monétaire » ici, contrairement au numéro sénégalais : elle ferait reculer le
     * motif d'un groupe (`+33 6 12 34 56 78 F. Dupont` laisserait `78 F.`).
     */
    private const FOREIGN = '(?:(?<![0-9+])(?<![0-9][.,])'.self::NOT_A_FLOOR.'(?:\+(?!'.self::WS.'{1,2}[0-9]{1,3}(?:'.self::SEP.'[0-9]{3})*'.self::SEP.'000(?![0-9]))'.self::WS.'{0,2}|00'.self::SEP.'?)(?:'
        .'33'.self::AFTER_CC.'(?:'.self::SEP.'{0,3}[0-9]){9}'
        .'|'.self::CC1.self::AFTER_CC.'(?:'.self::SEP.'?\([0-9]{3}\)(?:'.self::SEP.'{0,3}[0-9]){7}|(?:'.self::SEP.'{0,3}[0-9]){10})'
        .'|'.self::CC2.self::AFTER_CC.'(?:'.self::SEP.'{0,3}[0-9]){7,11}'
        .'|'.self::CC3.self::AFTER_CC.'(?:'.self::SEP.'{0,3}[0-9]){6,10}'
        .')(?<!'.self::SEP.'[0-9])'
        .'|(?<![0-9])0[1-9](?:[0-9]{8}|(?<sep>'.self::SEP.')[0-9]{2}(?:\k<sep>[0-9]{2}){3}))(?![0-9])';

    /**
     * Le lien WhatsApp canonique, qui écrit le numéro sans `+` : `wa.me/33612345678`,
     * `api.whatsapp.com/send?phone=2250712345678`. Un indicatif ITU et sa longueur, collés.
     */
    private const LINK = '(?<=wa\.me\/|[?&]phone=)(?:'
        .'33[0-9]{9}'
        .'|'.self::CC1.'[0-9]{10}'
        .'|'.self::CC2.'[0-9]{7,11}'
        .'|'.self::CC3.'[0-9]{6,10}'
        .')(?![0-9])';

    /**
     * Le numéro SÉNÉGALAIS, rien d'autre : `RadarPhone::canonical()` s'y fie (un numéro étranger n'est
     * pas un contact du Radar). S'applique au texte normalisé (`normalizeDigits()`, sans
     * invisibles). Un séparateur facultatif entre les groupes 2-3-2-2, 2-2-2-3 ou 3-2-2-2 :
     * `750 000 000` (3-3-3) n'en est aucun.
     */
    public const PATTERN = '/'.self::SENEGAL.self::END.'/iu';

    /**
     * Ce que le masquage et la garde des jeux d'évaluation reconnaissent : un numéro sénégalais (`PATTERN`,
     * plus son indicatif explicite et ses groupements libres), un numéro étranger, un lien WhatsApp
     * (TCK-2410). L'indicatif explicite passe en premier : `+221 77 …` est un seul numéro.
     */
    public const MASK_PATTERN = '/(?:'.self::SENEGAL_WITH_CODE
        .'|'.self::SENEGAL.self::END
        .'|'.self::SENEGAL_LOOSE.self::END
        .'|'.self::SENEGAL_SEPARATED
        .'|'.self::FOREIGN
        .'|'.self::LINK.')/iu';

    public const TOKEN = '[TELEPHONE]';

    /** Retirés avant le motif : « 77<ZWSP>123 45 67 » est un numéro. */
    public const INVISIBLE = '/[\x{200B}\x{200C}\x{200D}\x{2060}\x{FEFF}\x{00AD}]/u';

    /**
     * Premier code point de chaque série de chiffres non ASCII ramenée à 0-9 : pleine chasse, arabes-indiens,
     * indo-aryens et d'Asie du Sud-Est, N'Ko, mathématiques. Un chiffre qu'aucun motif ne lit est un numéro qui passe.
     */
    private const DIGIT_ZEROS = [
        0xFF10, 0x0660, 0x06F0, 0x07C0, 0x0966, 0x09E6, 0x0A66, 0x0AE6, 0x0B66, 0x0BE6, 0x0C66, 0x0CE6,
        0x0D66, 0x0E50, 0x0ED0, 0x0F20, 0x1040, 0x17E0, 0x1810, 0x1D7CE, 0x1D7D8, 0x1D7E2, 0x1D7EC, 0x1D7F6,
    ];

    /** Le `+` et les séparateurs écrits en pleine chasse ou en forme de petite capitale, un code point pour un. */
    private const PUNCTUATION = [0xFF0B => '+', 0xFE62 => '+', 0xFF0D => '-', 0xFF0E => '.', 0xFF0F => '/'];

    /** @var array<string, string>|null */
    private static ?array $digits = null;

    public static function mask(string $text): string
    {
        return self::maskValid($text) ?? self::maskValid(mb_scrub($text, 'UTF-8')) ?? throw new \RuntimeException('ai.phone_mask_failed');
    }

    /** Les chiffres non ASCII et le `+` pleine chasse en ASCII, un code point pour un code point. */
    public static function normalizeDigits(string $text): string
    {
        if (self::$digits === null) {
            self::$digits = [];
            foreach (self::DIGIT_ZEROS as $zero) {
                for ($i = 0; $i <= 9; $i++) {
                    self::$digits[mb_chr($zero + $i, 'UTF-8')] = (string) $i;
                }
            }
            foreach (self::PUNCTUATION as $code => $ascii) {
                self::$digits[mb_chr($code, 'UTF-8')] = $ascii;
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
