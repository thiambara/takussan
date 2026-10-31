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
     *
     * TCK-2454 — un numéro tronqué suivi d'un autre s'arrête devant le second : `00221 77 012 34 / 78 123 45 67`
     * se lisait jusqu'au `78`, `123 45 67` partait en clair, et le Radar lisait `+221770123478`, un numéro que personne n'a écrit.
     * Pas neuf chiffres écrits par groupes (`SHAPED`) : `+221 76 330 45 67 25 000 F` est un numéro entier et un prix, pas `76` puis `+221330456725`.
     * Au moins cinq chiffres devant le second : `+221 30 31 32 33 5 3 500` n'est pas `30 31` puis `+221323353500`.
     */
    private const SENEGAL_WITH_CODE = '(?<![0-9])(?:\+'.self::WS.'{0,2}|00'.self::WS.'?)221'.self::CALL_AFTER_CC.self::SEP.'{0,3}'
        .'(?:(?!'.self::CALL_SHAPED.')'.self::PREFIX_SPACED.'(?:'.self::SEP.'{0,3}[0-9]){3,6}(?='.self::SEP.'{1,3}'.self::CALL_WHOLE.')'
        .'|'.self::PREFIX_SPACED.'(?:'.self::SEP.'{0,3}[0-9]){7}(?![0-9]))';

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
     * TCK-2454 — chiffre à chiffre, un chiffre seul derrière : `SENEGAL_LOOSE` refuse la forme stricte devant un chiffre isolé, et se
     * rabattait sur le chiffre suivant : `7 7 0 1 2 3 4 5 6 2 salons` laissait `7` en clair, et le Radar lisait `+221701234562`, un numéro
     * que personne n'a écrit. Là où ce décalage se lisait, et seulement là, les neuf premiers chiffres sont le numéro.
     * Une liste que le décalage ne lit pas (`7 1 2 3 4 5 6 7 8 9`) reste une liste.
     * Pas le chiffre d'un étage (`R+7 7 0 1 …`, dont le `+` devient `#` pour le Radar : `RadarPhone::withoutFloorPlus`). Limite : `7 70 12 34 56 2 salons` se lit encore `+221701234562`, un chiffre seul peut y être un compte (`7 77012345 6`).
     */
    private const SENEGAL_NOT_SHIFTED = '(?<![0-9+#])(?<![+#]'.self::WS.')(?<![+#]'.self::WS.self::WS.')(?=[0-9]'.self::WS.self::CALL_LOOSE.self::CALL_END.')'
        .'(?:3'.self::WS.'[02369]|7'.self::WS.'[0-25-9]|9'.self::WS.'3)(?:'.self::WS.'[0-9]){7}(?='.self::WS.'[0-9](?![0-9]))';

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
     * `RadarPhone::withoutFloorPlus()`, qui n'a pas de numéro étranger à rendre.
     *
     * TCK-2435 — l'étage s'écrit aussi `RDC+1` (rez-de-chaussée plus un) et `R + 1`, `R +1`, `R+ 1` : au plus deux espaces
     * de chaque côté du `+`, le même étage de 0 à 19. `R + 33 6 12 34 56 78`, `RDC+33612345678`, `RDC+44 7700 900123`
     * restent des numéros. Le mot de l'étage est énuméré branche par branche : un lookbehind PCRE n'admet que des
     * branches de longueur fixe. Un étage `1` ou `7` n'en est plus un quand ce qui le suit forme un numéro complet de cet
     * indicatif (`CC1_REST`) : `Appartement au RDC\n+1 514 555 0199`, `R+1 202 555 0123` sont masqués.
     */
    private const FLOOR_WORD = '(?<=(?<!\p{L})r|(?<!\p{L})rdc'
        .'|(?<!\p{L})r'.self::WS.'|(?<!\p{L})rdc'.self::WS
        .'|(?<!\p{L})r'.self::WS.self::WS.'|(?<!\p{L})rdc'.self::WS.self::WS.')';

    /**
     * TCK-2435 (vérification adverse 1) — derrière l'indicatif `1` ou `7`, les dix chiffres d'un numéro complet de ce
     * plan (la zone entre parenthèses comprise, comme dans `FOREIGN`), qu'aucune marque monétaire ne suit :
     * `R+1 1 250 500 750 F` reste un étage suivi d'un prix. Un `F` suivi d'un point puis d'une lettre n'est pas une marque
     * ici (`… 0199 F. Diop`, une initiale) ; `… 750 F.` en fin de texte en est une. Lu aussi par `RadarPhone::FLOOR_PLUS`.
     */
    public const CC1_REST = '(?:'.self::SEP.'?\([0-9]{3}\)(?:'.self::SEP.'{0,3}[0-9]){7}|(?:'.self::SEP.'{0,3}[0-9]){10})(?![0-9])'
        .'(?!'.self::WS.'*(?:(?:f'.self::WS.'?cfa|cfa|xof|francs?)(?!\p{L})|f(?!\p{L}|\.'.self::WS.'*\p{L})))';

    /**
     * TCK-2435 (vérification adverse 2) — derrière l'indicatif `1`, la forme nord-américaine `[2-9]XX [2-9]XX XXXX` est un
     * numéro QUELLE QUE SOIT la marque qui suit (`au RDC +1 514 555 0199 F Diop`, `F` initiale sans point). Un prix
     * d'étage n'a pas cette forme : il commence par 1 (`R+1 1 250 500 750 F`) ou porte un 0 en quatrième chiffre
     * (`RDC +1 2 500 500 750 F`).
     */
    private const NANP_REST = '(?:'.self::SEP.'?\([2-9][0-9]{2}\)|'.self::SEP.'{0,3}[2-9](?:'.self::SEP.'{0,3}[0-9]){2})'
        .self::SEP.'{0,3}[2-9](?:'.self::SEP.'{0,3}[0-9]){6}(?![0-9])';

    /**
     * Derrière l'indicatif `7`, dix chiffres dont le premier est de 3 à 9 sont un numéro quelle que soit la marque qui suit :
     * les mobiles russes (`9XX`) et kazakhs (`7XX`), et les fixes (`495`, `812`, `343`…). Décision de la session : un prix
     * d'étage marqué de cette forme (`R+7 3 250 500 750 F`) est perdu plutôt qu'un fixe envoyé en clair.
     *
     * TCK-2445 — la zone entre parenthèses aussi (`RDC +7 (495) 123-45-67 F`, `ZONE_REST`), et la zone longue
     * (`CC7_LONG_ZONE`).
     */
    private const CC7_REST = '(?:'.self::ZONE_REST.'|'.self::CC7_LONG_ZONE
        .'|'.self::SEP.'{0,3}[3-9](?:'.self::SEP.'{0,3}[0-9]){9})(?![0-9])';

    /**
     * TCK-2445 — derrière `1` ou `7`, une zone de trois chiffres entre parenthèses (quels qu'ils soient) et sept chiffres sont
     * un numéro quelle que soit la marque qui suit : sans elle, `RDC +7 (495) 123-45-67 F` partait en clair derrière `RDC` ou
     * un `R` espacé, puisque `CC1_REST` refuse une marque derrière. Limite assumée, dans le sens sûr : un nombre de trois
     * chiffres entre parenthèses derrière un étage, suivi d'un prix dont les sept premiers chiffres finissent un groupe, est
     * masqué et le prix perdu (`Villa R+1 (150) 2 500 000 F`).
     */
    private const ZONE_REST = self::SEP.'?\([0-9]{3}\)(?:'.self::SEP.'{0,3}[0-9]){7}(?![0-9])';

    /**
     * TCK-2445 — derrière `7`, une zone de quatre ou cinq chiffres entre parenthèses, puis le reste des dix chiffres
     * (`+7 (3452) 12-34-56`, `+7 (34922) 1-23-45`) : `FOREIGN` n'admettait que la zone de trois, et ce numéro partait en
     * clair partout. Lu aussi par `CC7_REST` : derrière un étage, il garde son `+`. La zone commence par 3 à 9 (Russie : 3, 4,
     * 8 ; Kazakhstan : 7) : une année entre parenthèses (`Immeuble R+7 (2024) 450 000 000 F`) n'en est pas une. Limite
     * assumée, dans le sens sûr : un nombre nu de quatre ou cinq chiffres commençant par 3 à 9 entre parenthèses, suivi de
     * six ou cinq chiffres, est masqué et le prix perdu (`R+7 (3500) 450 000 000 F`, `R+7 (8000) 650 000 F`, un code postal
     * `(32000) 45 000 F`) ; suivi d'une unité, il reste intact (`(3500 m²)`).
     */
    private const CC7_LONG_ZONE = self::SEP.'?\((?=[3-9])(?:[0-9]{4}\)(?:'.self::SEP.'{0,3}[0-9]){6}|[0-9]{5}\)(?:'.self::SEP.'{0,3}[0-9]){5})';

    /**
     * L'indicatif `1` ou `7` et le numéro complet qui le suit : ce qui, derrière un `+` d'étage, n'est pas un étage. Le `(0)`
     * de trunk, que `FOREIGN` admet par `AFTER_CC`, aussi (TCK-2445 : `RDC +7 (0)495 123-45-67` partait en clair).
     */
    public const CC1_NUMBER = '(?&pm_n1)';

    /** Le corps de `CC1_NUMBER`, défini une fois dans `DEFINITIONS`. */
    private const CC1_NUMBER_BODY = '[17]'.self::NOT_SENEGAL_ZONE.'(?:(?<=1)'.self::TRUNK_ZERO.'(?:'.self::CC1_REST.'|'.self::NANP_REST.'|'.self::ZONE_REST.')'
        .'|(?<=7)'.self::TRUNK_ZERO.'(?:'.self::CC1_REST.'|'.self::CC7_REST.'))';

    /**
     * TCK-2447 — derrière le `1` ou le `7` d'un étage, `(221)` suivi d'un numéro sénégalais (`PATTERN`) est l'indicatif du
     * Sénégal entre parenthèses, pas une zone : `Villa R+1 (221) 77 012 34 56` se lisait `+1 (221) 77 012 34`, un numéro
     * complet, et le contact se perdait. Hors d'un étage, `FOREIGN` le lit toujours (`Contact +1 (221) 77 012 34 56`).
     *
     * TCK-2451 — de même `(221)` devant un numéro à groupement libre (`SENEGAL_LOOSE` : `R+1 (221) 77 01 234 56`), et `00221`
     * ou `221` nu devant un numéro de `PATTERN` (`R+1 00221 77 012 34 56`, `R+1 221 77 012 34 56`) : `R+1 00221 77 012 34 56`
     * se lisait `+1 0022177012`, et `34 56` partait en clair. Chaque branche lit ce que le masque lira ensuite en entier
     * (`SENEGAL_WITH_CODE` derrière `00221` prend les mêmes neuf chiffres que `PATTERN`), sans chiffre derrière à trois
     * séparateurs près (un numéro tronqué suivi d'un autre, `R+1 00221 77 012 34 / 78 123 45 67`, se lirait jusqu'au `78`) :
     * l'étage ne reste un étage que si le numéro est masqué en entier. Les autres écritures restent lues par `FOREIGN`, qui
     * englobe alors le numéro (`CODED_SENEGAL`).
     *
     * « Sans chiffre derrière » admet un petit nombre suivi d'un mot (`NOTHING_GLUED`) : `… 34 56 3 chambres`, une ligne suivante
     * `2 salons`. Placée derrière le `1` ou le `7` et devant le `(0)` de trunk (qu'elle lit) : un seul exemplaire pour les deux
     * indicatifs.
     *
     * TCK-2454 — « sans chiffre derrière » ne vaut plus devant un numéro écrit par groupes (`SHAPED`) : neuf chiffres derrière
     * un indicatif sont un numéro entier, et ce qui les suit n'en est pas (`R+1 00221 77 012 34 56 12 500 F`, `… 78 90`). Sauf
     * s'ils se coupent sur un autre numéro (`NOT_CUT`) ou sur un montant (`NO_THOUSANDS`). Et ce que `BARE_CODE_NINE` lira ensuite.
     */
    private const NOT_SENEGAL_ZONE = '(?!'.self::TRUNK_ZERO.self::SEP.'{0,3}(?:\(221\)'.self::SEP.'{0,3}'.self::CALL_NOT_CUT.self::CALL_SENEGAL.self::CALL_END
        .'|\(221\)'.self::SEP.'{0,3}'.self::CALL_LOOSE.self::CALL_END.self::NOTHING_GLUED
        .'|\(221\)'.self::SEP.'{0,3}'.self::CALL_NOT_CUT.'(?='.self::CALL_SHAPED.')'.self::CALL_LOOSE.self::CALL_END.self::NO_THOUSANDS
        .'|(?=(?:00)?221'.self::SEP.'?'.self::CALL_NOT_CUT.')(?:(?=00)'.self::CALL_SENEGAL.'(?![0-9])|(?=221)'.self::CALL_SENEGAL.self::CALL_END.')'.self::NO_THOUSANDS
        .'|'.self::CALL_BARE_NINE.'))';

    /**
     * TCK-2454 — les neuf chiffres d'un numéro sénégalais écrit par groupes de deux ou trois (2-3-2-2, 2-2-2-3, 3-2-2-2, 2-2-3-2,
     * 3-3-3, ou d'un seul tenant), ou un à un, sans indicatif : la coupure au neuvième chiffre tombe sur la coupure que l'auteur a
     * écrite. `77 012 3 12 500 F` n'en est pas un : son neuvième chiffre tombe au milieu du montant.
     */
    private const SHAPED = '(?:'.self::PREFIX.self::CALL_SEP.'?(?:[0-9]{3}'.self::CALL_SEP.'?[0-9]{2}'.self::CALL_SEP.'?[0-9]{2}|[0-9]{2}'.self::CALL_SEP.'?[0-9]{2}'.self::CALL_SEP.'?[0-9]{3}|[0-9]{2}'.self::CALL_SEP.'?[0-9]{3}'.self::CALL_SEP.'?[0-9]{2})'
        .'|'.self::PREFIX.'[0-9]'.self::CALL_SEP.'?(?:[0-9]{2}'.self::CALL_SEP.'?[0-9]{2}'.self::CALL_SEP.'?[0-9]{2}|[0-9]{3}'.self::CALL_SEP.'?[0-9]{3})'
        .'|'.self::PREFIX_SPACED.'(?:'.self::CALL_SEP.'[0-9]){7})(?![0-9])';

    /** `RadarPhone` : les neuf chiffres sont-ils écrits par groupes ? */
    public const SHAPED_NUMBER = '/^'.self::SHAPED.'$'.self::DEFINITIONS.'/iu';

    /** TCK-2454 — un numéro sénégalais entier, tel que le masque le lit sans indicatif : ce qui commence un second numéro. */
    private const WHOLE_SENEGAL = '(?:'.self::CALL_SENEGAL.self::CALL_END.'|'.self::CALL_LOOSE.self::CALL_END.')';

    /**
     * TCK-2454 — placé devant les neuf chiffres : aucun numéro entier ne commence avant le neuvième. Sinon le premier est tronqué
     * et le second déborderait du masque : `77 012 34 / 78 123 45 67` se lirait `77 012 34 / 78`, et `123 45 67` sortirait en clair.
     * Il faut au moins deux chiffres de plus que le premier numéro : un numéro entier que rien ne suit n'est jamais coupé. Le second
     * compte même suivi d'une marque, qui en ferait un prix : `77 012 34/33 821 00 00 F` n'a pas de contact `+221770123433`.
     * Neuf chiffres écrits par groupes (`SHAPED`) ne se coupent pas, sauf devant ou à travers une barre (`77 012 34/78 123 45 67`) : le numéro entier gagne. `77 012 34 78 123 45 67` est
     * illisible : un numéro entier suivi d'un reste plutôt qu'un tronqué suivi d'un autre, décision du 2026-10-31, un numéro complet étant le cas réel.
     */
    private const NOT_CUT = '(?:(?='.self::CALL_SHAPED.'(?!'.self::SEP.'{0,2}\/))(?!(?:'.self::SEP.'{0,3}[0-9]){1,8}'.self::SEP.'{0,2}\/)|(?!(?:'.self::SEP.'{0,3}[0-9]){2,8}'.self::SEP.'{1,3}(?:'.self::CALL_SENEGAL.'|'.self::CALL_LOOSE.')(?![0-9])))';

    /**
     * TCK-2454 — `221` nu ou `(221)`, puis neuf chiffres qu'aucune lecture ne prend pour un numéro entier : groupement que le masque
     * ne lit pas (`(221) 7 7 0 1 2 3 4 56`, `221 770 123 456`), marque derrière (`221 770123456 F`), ou chiffre à chiffre suivi d'un
     * petit nombre (`(221) 7 7 0 1 2 3 4 5 6 3 chambres`, qui se lisait `7 0 1 2 3 4 5 6 3`). Masqué avec son indicatif, jusqu'au
     * neuvième chiffre, sous les gardes de `CODED_BODY` (`221 77 012 3 / 450 000 F` garde son montant). L'indicatif change la lecture :
     * sans lui, `770123456 F` reste un prix. Pas un nombre qui finit par `000`, un montant derrière un autre nombre (`Lot (221) 300 000 000 F`).
     */
    private const BARE_CODE_NINE = '(?:\(221\)|(?<![0-9])221)'.self::SEP.'{0,3}(?!'.self::CALL_WHOLE.')'.self::CALL_NOT_CUT.self::CALL_CODED_BODY.'(?<!000)';

    /**
     * TCK-2454 — placé derrière les neuf chiffres : pas un groupe `000` juste derrière. `000 F` n'est le prix de personne, c'est la
     * fin d'un montant dont le neuvième chiffre fait partie : `77 012 3 / 450 000 F`, et `77 012 34 56 000 F` s'y lit de même
     * (`CUT_CODED_SENEGAL`). Sauf si le dernier groupe commence par 0 : `33 821 00 00 000 F` n'a pas de montant. Limite : `77 012 34 56 500 F`
     * se lit comme un numéro suivi de 500 F, pas 56 500 F.
     */
    private const NO_THOUSANDS = '(?:(?<='.self::SEP.'0[0-9])|(?!'.self::SEP.'{1,3}000(?![0-9])))';

    /** TCK-2454 — un montant groupé par milliers, ce que le chiffre du numéro tronqué qui le précède ne doit pas entamer. D'autres chiffres derrière : ce n'en est pas un (`12 345 67`). */
    private const AMOUNT = '[1-9][0-9]{0,2}(?:'.self::SEP.'[0-9]{3})+(?!'.self::SEP.'?[0-9])';

    /**
     * TCK-2451 — derrière un numéro, aucun chiffre à trois séparateurs près, sauf un nombre d'un à trois chiffres suivi d'un mot
     * (`3 chambres`, `1er étage`, `\n2 salons`) : la règle de `FOREIGN` (« `… 56 78 3 chambres` : le `3` n'est pas au numéro »).
     * Pas un nombre qui commence par 0 : `000 F` est la fin d'un montant (`77 012 3 / 450 000 F`), pas un compte.
     */
    private const NOTHING_GLUED = '(?:(?!'.self::SEP.'{0,3}[0-9])|(?='.self::SEP.'{1,3}[1-9][0-9]{0,2}'.self::WS.'*\p{L}))';

    /**
     * TCK-2451 — la fin d'un numéro sénégalais lu derrière un indicatif étranger (`CODED_SENEGAL`) : aucun chiffre ne le prolonge
     * à trois séparateurs près, sauf le début d'un autre numéro entier (`… 34 56 / 78 123 45 67`). Sans elle, un numéro tronqué
     * suivi d'un autre (`+1 00221 77 012 34 / 78 123 45 67`) se lisait jusqu'au `78`, et `123 45 67` partait en clair.
     * Un petit nombre suivi d'un mot est admis aussi (`NOTHING_GLUED`).
     */
    private const WHOLE_NUMBER_END = '(?![0-9])(?:'.self::NOTHING_GLUED.'|(?='.self::SEP.'{0,3}(?:'.self::CALL_WITH_CODE
        .'|'.self::CALL_SENEGAL.self::CALL_END.'|'.self::CALL_LOOSE.self::CALL_END.')))';

    /** Le `(0)` de trunk facultatif derrière l'indicatif, comme dans `AFTER_CC`. */
    private const TRUNK_ZERO = '(?:'.self::WS.'?\(0\))?';

    /** Ce qui suit le `+` d'un étage : un étage de 0 à 19, sauf `1` ou `7` suivi d'un numéro complet. */
    public const FLOOR_AFTER_PLUS = self::WS.'{0,2}(?:[02-689]|(?!'.self::CC1_NUMBER.')[17]|1[0-9])(?![0-9])';

    private const NOT_A_FLOOR = '(?!'.self::FLOOR_WORD.'\+'.self::FLOOR_AFTER_PLUS.')';

    /**
     * Un numéro étranger (TCK-2410) : `+` (une espace tolérée derrière) ou `00`, un indicatif ITU, puis
     * les chiffres, séparés par au plus trois caractères (espace, point, tiret, barre oblique). Après
     * l'indicatif, trois parenthèses seulement : `(+33) 6 …`, le `(0)` de `+33 (0)6 …` (il compte pour
     * un chiffre), et la zone de `+1 (202) 555 0123` (de `+7 (3452) 12-34-56` aussi, TCK-2445). Ailleurs `(` coupe le numéro : `ADR-0064 (2026-10-14)`
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
    private const FOREIGN = '(?:(?<![0-9+])(?<![0-9][.,])'.self::NOT_A_FLOOR.'(?:\+(?!'.self::WS.'{1,2}[0-9]{1,3}(?:'.self::SEP.'[0-9]{3})*'.self::SEP.'000(?![0-9]))'.self::WS.'{0,2}|00'.self::SEP.'?)'
        .'(?:(?='.self::FOREIGN_NUMBER.'(?<!'.self::SEP.'[0-9])(?![0-9]))'.self::CODED_SENEGAL.'|'.self::CUT_CODED_SENEGAL.'|'.self::FOREIGN_NUMBER.'(?<!'.self::SEP.'[0-9]))'
        .'|(?<![0-9])0[1-9](?:[0-9]{8}|(?<sep>'.self::SEP.')[0-9]{2}(?:\k<sep>[0-9]{2}){3}))(?![0-9])';

    /**
     * TCK-2441 — ce que `FOREIGN` lit derrière le `+` ou le `00` : un indicatif ITU et le nombre de chiffres de son plan.
     * Lu aussi par `RadarPhone::FLOOR_PLUS` : derrière `R+` collé, un numéro étranger complet garde son `+`.
     */
    public const FOREIGN_NUMBER = '(?&pm_fn)';

    /** Le corps de `FOREIGN_NUMBER`, défini une fois dans `DEFINITIONS`. */
    private const FOREIGN_NUMBER_BODY = '(?:'
        .'33'.self::CALL_AFTER_CC.'(?:'.self::SEP.'{0,3}[0-9]){9}'
        .'|'.self::CC1.self::CALL_AFTER_CC.'(?:'.self::SEP.'?\([0-9]{3}\)(?:'.self::SEP.'{0,3}[0-9]){7}|(?:'.self::SEP.'{0,3}[0-9]){10})'
        .'|7'.self::CALL_AFTER_CC.self::CC7_LONG_ZONE
        .'|'.self::CC2.self::CALL_AFTER_CC.'(?:'.self::SEP.'{0,3}[0-9]){7,11}'
        .'|'.self::CC3.self::CALL_AFTER_CC.'(?:'.self::SEP.'{0,3}[0-9]){6,10})';

    /**
     * TCK-2451 — un indicatif étranger suivi d'un numéro sénégalais écrit avec son indicatif (`00221`, `221` nu, et `(221)`
     * derrière `1` ou `7`, la zone que `FOREIGN_NUMBER` lit) : `FOREIGN` le lisait jusqu'à la longueur de son plan et
     * laissait la fin en clair (`Immeuble R+20 00221 77 123 45 67` → `[TELEPHONE] 45 67`). Il englobe désormais le numéro
     * entier, à groupement libre et quelle que soit la marque qui suit : `Immeuble R[TELEPHONE]`, `Contact [TELEPHONE]`.
     * Seulement là où `FOREIGN` lisait déjà un numéro, bornes comprises (le lookahead de `FOREIGN`) : `Immeuble R+20 221 7 7 1 2
     * 3 4 5 6 7` et `Contact +1 (221) 770123456`, que `FOREIGN` ne lisait pas, gardent leur contact. Ce n'est pas un contact du
     * Radar (l'indicatif étranger reste devant), comme avant.
     */
    private const CODED_SENEGAL = self::CODED_HEAD.self::SEP.'{0,3}'.self::CALL_CODED_BODY;

    /**
     * L'indicatif étranger et l'indicatif sénégalais qui le suit. TCK-2454 : tout nombre de un à trois chiffres devant, et `0221`
     * aussi (`+10 00221 …`, `R+105 221 …`, `R+20 0221 …`) : `FOREIGN_NUMBER` les lit déjà comme un numéro, `1` et dix chiffres.
     */
    private const CODED_HEAD = '(?:'.self::CC1.self::CALL_AFTER_CC.self::SEP.'?\(221\)|[1-9][0-9]{0,2}'
        .self::CALL_AFTER_CC.self::SEP.'{0,3}(?:00?'.self::WS.'?)?221)';

    /**
     * Les neuf chiffres derrière ces deux indicatifs. TCK-2454 : écrits par groupes, ils s'arrêtent là quoi qui les suive, sauf s'ils
     * se coupent sur un autre numéro ou sur un montant (`SHAPED`, `NOT_CUT`, `NO_THOUSANDS`) : `+1 00221 77 012 34 56 12 500 F`.
     * Écrits autrement (`77 0 12 34 56`, `7 7 0 1 …`), aussi, sauf devant un groupe de trois chiffres, que leur dernier groupe
     * pourrait entamer : `77 012 3 12 500 F` n'a pas de numéro entier, il a un montant de 12 500.
     */
    private const CODED_BODY = '(?:'.self::PREFIX_SPACED.'(?:'.self::SEP.'{0,3}[0-9]){7}'.self::WHOLE_NUMBER_END
        .'|'.self::CALL_NOT_CUT.self::CALL_SHAPED.self::NO_THOUSANDS
        .'|'.self::CALL_NOT_CUT.self::PREFIX_SPACED.'(?:'.self::SEP.'{0,3}[0-9]){7}(?![0-9])(?!'.self::SEP.'{1,3}[0-9]{3}(?:'.self::SEP.'[0-9]{3})*(?!'.self::SEP.'?[0-9])))';

    /**
     * TCK-2454 — un numéro tronqué derrière un indicatif étranger et `00221` (pas `221` nu : `+33 221 77 01 23` est un numéro français
     * entier, et le `3` de `… 23 3 chambres` n'y est pas) : le numéro que `FOREIGN_NUMBER` lit, plus les chiffres qui restent
     * jusqu'à ce qui n'en est plus, un autre numéro entier ou un montant, ou plus rien : `R+1 00221 77 012 34 / 78 123 45 67`
     * laissait `34`, `R+1 00221 77 012 3 / 450 000 F` laissait `3`. Au plus trois chiffres : au-delà, ce qui suit n'est plus le reste de
     * ce numéro (`R+1 221 77 012 34 56 000 F`, lu jusqu'au bout, perdrait son montant).
     */
    private const CUT_CODED_SENEGAL = '(?=[1-9][0-9]{0,2}'.self::CALL_AFTER_CC.self::SEP.'{0,3}00?'.self::WS.'?221'.self::SEP.'{0,3}'.self::PREFIX_SPACED.')'.self::FOREIGN_NUMBER.'(?<!'.self::SEP.'[0-9])(?![0-9])'
        .'(?:'.self::SEP.'{0,3}[0-9]){1,3}(?![0-9])(?:(?!'.self::SEP.'{0,3}[0-9])|(?='.self::SEP.'{1,3}(?:'.self::CALL_WHOLE.'|'.self::AMOUNT.')))';

    /**
     * TCK-2455 — un indicatif étranger qui se lit aussi comme un préfixe sénégalais (`33`, `30`, `75`, `93`…), avec ou sans `+`, devant un
     * numéro sénégalais écrit avec `00221` ou `221` nu : le masque y lisait un numéro sénégalais qui commence au préfixe
     * (`33 00221 7 7`), et le reste partait en clair (`Tel +33 00221 7 7 0 1 2 3 4 5 6`, `Tel 30 00221 77 012 34 56`). Il l'englobe
     * désormais en entier. Seulement là où ce numéro se lisait déjà : `33 221 77 012 34 56`, où seul `221 …` se lit, garde son contact.
     */
    private const PREFIX_BEFORE_CODE = '(?<![0-9+])(?:\+'.self::WS.'{0,2})?(?='.self::CALL_WHOLE.')'.self::PREFIX.self::SEP.'{0,3}(?:00?'.self::WS.'?)?221'.self::SEP.'{0,3}'.self::CALL_CODED_BODY;

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
    public const MASK_PATTERN = '/(?:'.self::PREFIX_BEFORE_CODE
        .'|'.self::CALL_WITH_CODE
        .'|'.self::CALL_SENEGAL.self::CALL_END
        .'|'.self::CALL_LOOSE.self::CALL_END
        .'|'.self::SENEGAL_NOT_SHIFTED
        .'|'.self::SENEGAL_SEPARATED
        .'|'.self::FOREIGN
        .'|'.self::CALL_BARE_NINE
        .'|'.self::LINK.')'.self::DEFINITIONS.'/iu';

    /**
     * TCK-2451 — les sous-motifs que plusieurs branches lisent, définis UNE fois et appelés par `(?&pm_…)` : recopiés à chaque
     * usage, ils portaient `MASK_PATTERN` à 36 ko de source, et PCRE2 10.44 (celle de l'image de production,
     * `dunglas/frankenphp`) le refusait (« regular expression is too large ») quand 10.49 l'acceptait. Placé en fin de motif :
     * les groupes numérotés qui le précèdent gardent leur numéro (`$1`, `$2` de `RadarPhone::FLOOR_PLUS`). Tout motif qui lit
     * `CC1_NUMBER`, `FOREIGN_NUMBER` ou `FLOOR_AFTER_PLUS` doit le porter. Le miroir JS
     * (`scripts/check-ai-evals-pii.mjs`) garde la forme recopiée : sa parité se juge sur le comportement (fixture partagé).
     * Le smoke de l'image (`deploy/takussan/smoke-api.sh image`) éprouve la compilation sur la PCRE de production.
     */
    public const DEFINITIONS = '(?(DEFINE)(?<pm_sn>'.self::SENEGAL.')(?<pm_sl>'.self::SENEGAL_LOOSE.')(?<pm_sc>'.self::SENEGAL_WITH_CODE.')'
        .'(?<pm_ac>'.self::AFTER_CC.')(?<pm_end>'.self::END.')(?<pm_fn>'.self::FOREIGN_NUMBER_BODY.')(?<pm_n1>'.self::CC1_NUMBER_BODY.')'
        .'(?<pm_s>'.self::SEP.')(?<pm_ws>'.self::WHOLE_SENEGAL.')(?<pm_nc>'.self::NOT_CUT.')(?<pm_sh>'.self::SHAPED.')(?<pm_cb>'.self::CODED_BODY.')(?<pm_bn>'.self::BARE_CODE_NINE.'))';

    private const CALL_SENEGAL = '(?&pm_sn)';

    private const CALL_LOOSE = '(?&pm_sl)';

    private const CALL_WITH_CODE = '(?&pm_sc)';

    private const CALL_AFTER_CC = '(?&pm_ac)';

    private const CALL_END = '(?&pm_end)';

    private const CALL_SEP = '(?&pm_s)';

    private const CALL_WHOLE = '(?&pm_ws)';

    private const CALL_NOT_CUT = '(?&pm_nc)';

    private const CALL_SHAPED = '(?&pm_sh)';

    private const CALL_CODED_BODY = '(?&pm_cb)';

    private const CALL_BARE_NINE = '(?&pm_bn)';

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
