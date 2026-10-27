<?php

namespace App\Services\Ai\Evaluation;

use App\Support\PhoneMasker;
use Closure;
use RuntimeException;

/**
 * TCK-2384 — un cas d'évaluation n'entre dans le dépôt qu'anonymisé, et un dépôt n'oublie pas.
 *
 * Les valeurs des champs personnels (nom, téléphone, courriel, contact, propriétaire, adresse…) de
 * la proposition et de la valeur retenue sont remplacées par un jeton dans `expected`, et
 * **recherchées dans le texte d'entrée** : la valeur entière, et — pour un nom — chacun de ses mots
 * d'au moins trois lettres, car une annonce écrit « Awa » ou « Mme Diop ». La recherche ignore la
 * casse et les accents, tolère toute espace (insécable, fine, retour à la ligne) entre les mots,
 * et ne coupe jamais un mot plus long (« tel » n'est pas « El »). Les mots qui ne sont pas des noms
 * gardent leurs accents : la comparaison se fait sur une forme repliée, le remplacement sur l'original.
 *
 * Une adresse est jetonnée dans `expected` mais n'est jamais cherchée dans l'entrée : « Mermoz » est
 * la donnée que l'extraction doit retrouver. Puis tout numéro sénégalais et tout courriel restants
 * sont masqués, y compris écrits autrement (chiffres pleine chasse, `(at)` — TCK-2400).
 * `check-ai-evals-pii.mjs` garde le résultat ; aucun motif ne reconnaît un nom hors champ personnel.
 *
 * Les mots de deux lettres d'un nom (« Ba », « Ly », « Sy ») sont des noms de famille sénégalais
 * courants et ne sont pas des syllabes : ils sont cherchés comme les autres, sans égard à la casse
 * (« mme ly »), avec des bornes de mot Unicode (« Baobab » n'est pas « Ba »). Exception : une liste
 * fermée de petits mots français et wolof (`SHORT_STOP_WORDS`) qui ne sont jamais cherchés seuls — « Le »
 * de « Le Roux » ou « SA » de « SA Immo » —, la valeur entière, elle, l'étant toujours. Coût accepté :
 * un mot wolof en minuscules égal au nom de famille du cas est masqué, dans ce cas seulement. Un mot
 * d'une lettre n'est jamais cherché.
 *
 * Les apostrophes (U+0027, U+2019, U+2018, U+02BC, U+0060, U+00B4, U+2032, U+FF07) et les caractères
 * invisibles (U+200B, U+200C, U+200D, U+2060, U+FEFF, U+00AD) sont comparés de deux façons : retirés
 * (« N'Diaye » est « NDiaye », « Aw<ZWSP>a » est « Awa ») et pris pour une espace (« N'Diaye » est
 * « N Diaye », « Awa<ZWSP>Diop » est « Awa Diop »). Une trouvaille les englobe donc, et celle d'un nom
 * précédé d'une lettre et d'une apostrophe (« Diaye » dans « N'Diaye ») prend aussi cette lettre ; ceux
 * qui entourent un texte non personnel restent tels quels.
 */
final class EvalCaseAnonymizer
{
    public const NAME_TOKEN = '[NOM]';

    public const EMAIL_TOKEN = '[EMAIL]';

    public const ADDRESS_TOKEN = '[ADRESSE]';

    /**
     * Un courriel, aussi obfusqué (TCK-2400) : `awa (at) exemple.sn`, `awa[at]exemple.sn`,
     * `awa at exemple.sn`, `awa＠exemple.sn`, `awa @ exemple.sn`. `check-ai-evals-pii.mjs` porte le
     * même motif (`COURRIEL`).
     */
    public const EMAIL = '/[a-z0-9._%+\-]+(?:[\s\x{00A0}\x{202F}]*[@\x{FF20}][\s\x{00A0}\x{202F}]*|[\s\x{00A0}\x{202F}]*[\(\[\{][\s\x{00A0}\x{202F}]*at[\s\x{00A0}\x{202F}]*[\)\]\}][\s\x{00A0}\x{202F}]*|[\s\x{00A0}\x{202F}]+at[\s\x{00A0}\x{202F}]+)[a-z0-9\-]+(?:\.[a-z0-9\-]+)*\.[a-z]{2,}(?![a-z])/iu';

    private const SPACE = '[\s\x{00A0}\x{202F}]+';

    private const INVISIBLE_CHARS = '\x{200B}\x{200C}\x{200D}\x{2060}\x{FEFF}\x{00AD}';

    private const APOSTROPHE_CHARS = '\x{0027}\x{2019}\x{2018}\x{02BC}\x{0060}\x{00B4}\x{2032}\x{FF07}';

    private const INVISIBLE = '/['.self::INVISIBLE_CHARS.']/u';

    private const SEPARATOR = '/^['.self::INVISIBLE_CHARS.self::APOSTROPHE_CHARS.']$/u';

    /** Les apostrophes autres que U+0027, ramenées à U+0027. */
    private const APOSTROPHES = ['’' => "'", '‘' => "'", 'ʼ' => "'", '`' => "'", '´' => "'", '′' => "'", '＇' => "'"];

    /** Petits mots français et wolof qui ne sont jamais cherchés seuls comme mot d'un nom (la valeur entière l'est toujours). */
    private const SHORT_STOP_WORDS = [
        'le', 'la', 'les', 'de', 'du', 'da', 'di', 'do', 'el', 'al', 'sa', 'se', 'si', 'en', 'an', 'au', 'et', 'ou', 'un',
        'na', 'ne', 'ni', 'dr', 'mr', 'mm', 'me', 'ma', 'mo', 'no', 'on',
    ];

    /**
     * Un mot de la clé qui dit que la valeur n'est pas une personne : un compte, un type, un statut,
     * une préférence, un lieu (le quartier est la donnée que l'extraction doit retrouver).
     */
    private const NOT_PERSONAL = [
        'count', 'nombre', 'nb', 'type', 'preferred', 'prefere', 'statut', 'status',
        'quartier', 'neighbourhood', 'neighborhood', 'ville', 'city', 'zone', 'lieu',
    ];

    /** Ceux de NOT_PERSONAL qui désignent un lieu : ils l'emportent sur « nom » / « name », jamais sur un téléphone ou un courriel. */
    private const LOCATION_WORDS = ['quartier', 'neighbourhood', 'neighborhood', 'ville', 'city', 'zone', 'lieu'];

    /** Termes forts d'un nom (sous-chaînes), et faibles : un mot de NOT_PERSONAL l'emporte sur les faibles, pas sur les forts. */
    private const NAME_STRONG_SUB = ['prenom', 'fullname', 'firstname', 'lastname', 'surname', 'username'];

    private const NAME_STRONG_WORDS = ['nom', 'name'];

    private const NAME_WEAK_SUB = ['contact', 'proprietaire', 'owner', 'vendeur', 'seller', 'bailleur', 'locataire'];

    /**
     * Par genre, dans l'ordre d'essai : des sous-chaînes (termes assez longs pour ne rien attraper
     * d'autre) et des mots entiers (« nom » est dans « nombre », « tel » dans « hotel »).
     */
    private const KINDS = [
        'phone' => ['sub' => ['telephone', 'phone', 'whatsapp', 'mobile'], 'word' => ['tel']],
        'email' => ['sub' => ['mail'], 'word' => []],
        'address' => ['sub' => ['adresse', 'address'], 'word' => []],
        'name' => [
            'sub' => ['contact', 'proprietaire', 'owner', 'vendeur', 'seller', 'bailleur', 'locataire', 'prenom', 'fullname', 'firstname', 'lastname', 'surname', 'username'],
            'word' => ['nom', 'name'],
        ],
    ];

    private ?\Transliterator $folder = null;

    /** @var array<string, string> */
    private array $foldCache = [];

    /** @var array<string, string> */
    private array $stripCache = [];

    /**
     * @param  array<string, mixed>  $expected
     * @param  array<string, mixed>  $proposal
     * @return array{input: string, expected: array<string, mixed>}
     */
    public function anonymize(string $input, array $expected, array $proposal = []): array
    {
        $needles = [];
        $this->collectNeedles($proposal, null, $needles);
        $this->collectNeedles($expected, null, $needles);

        $clean = fn (string $text): string => preg_replace(
            self::EMAIL,
            self::EMAIL_TOKEN,
            PhoneMasker::mask($this->replaceNeedles($text, $needles)),
        ) ?? throw new RuntimeException('ai.eval_anonymize_failed');

        return ['input' => $clean($input), 'expected' => $this->walk($expected, null, $clean)];
    }

    /**
     * Le genre d'une clé personnelle (`phone`, `email`, `address`, `name`), ou null si elle ne l'est pas.
     * Un mot de NOT_PERSONAL (« type », « count »…) ôte à la clé ses seuls termes faibles (« contact »,
     * « owner ») et l'adresse ; un terme fort (nom, téléphone, courriel) reste personnel (« type_contact_name »),
     * sauf « nom » / « name » seuls face à un lieu (« nom_quartier »).
     */
    private function kindOf(string $key): ?string
    {
        $folded = $this->fold(preg_replace('/(?<=[a-z0-9])(?=[A-Z])/', '_', $key) ?? $key);
        $words = preg_split('/[^a-z]+/', $folded, -1, PREG_SPLIT_NO_EMPTY) ?: [];

        $kind = $this->kindByTerms($folded, $words, array_keys(self::KINDS));
        if ($kind === null) {
            return null;
        }

        $stopWords = array_values(array_filter($words, fn (string $word): bool => $this->isOneOf($word, self::NOT_PERSONAL)));
        if ($stopWords === []) {
            return $kind;
        }

        $strong = $this->kindByTerms($folded, $words, ['phone', 'email']);
        if ($strong !== null) {
            return $strong;
        }
        $hasStrongName = $this->hasAny($folded, self::NAME_STRONG_SUB) || array_filter($words, fn (string $w): bool => $this->isOneOf($w, self::NAME_STRONG_WORDS)) !== [];
        if (! $hasStrongName) {
            return null;
        }
        $isLocation = array_filter($stopWords, fn (string $w): bool => $this->isOneOf($w, self::LOCATION_WORDS)) !== [];
        if ($isLocation && ! $this->hasAny($folded, self::NAME_WEAK_SUB)) {
            return null;
        }

        return 'name';
    }

    /**
     * @param  list<string>  $words
     * @param  list<string>  $kinds
     */
    private function kindByTerms(string $folded, array $words, array $kinds): ?string
    {
        foreach ($kinds as $kind) {
            $terms = self::KINDS[$kind];
            if ($this->hasAny($folded, $terms['sub'])) {
                return $kind;
            }
            foreach ($words as $word) {
                if ($this->isOneOf($word, $terms['word'])) {
                    return $kind;
                }
            }
        }

        return null;
    }

    /** @param list<string> $terms */
    private function hasAny(string $folded, array $terms): bool
    {
        foreach ($terms as $term) {
            if (str_contains($folded, $term)) {
                return true;
            }
        }

        return false;
    }

    /** Le mot, ou son pluriel en « s », est l'un des termes. @param list<string> $terms */
    private function isOneOf(string $word, array $terms): bool
    {
        return in_array($word, $terms, true) || (str_ends_with($word, 's') && in_array(substr($word, 0, -1), $terms, true));
    }

    private function tokenOf(string $kind): string
    {
        return match ($kind) {
            'phone' => PhoneMasker::TOKEN,
            'email' => self::EMAIL_TOKEN,
            'address' => self::ADDRESS_TOKEN,
            default => self::NAME_TOKEN,
        };
    }

    /**
     * @param  array<int|string, mixed>  $values
     * @param  list<array{needle: string, token: string}>  $needles
     */
    private function collectNeedles(array $values, ?string $inherited, array &$needles): void
    {
        foreach ($values as $key => $value) {
            $kind = (is_string($key) ? $this->kindOf($key) : null) ?? $inherited;

            if (is_array($value)) {
                $this->collectNeedles($value, $kind, $needles);

                continue;
            }
            if ($kind === null || $kind === 'address' || ! (is_string($value) || is_int($value) || is_float($value))) {
                continue;
            }
            $this->addNeedles(trim((string) $value), $kind, $needles);
        }
    }

    /** @param array<string, array{needle: string, token: string}> $needles */
    private function addNeedles(string $value, string $kind, array &$needles): void
    {
        $token = $this->tokenOf($kind);
        $value = $this->strip($value);
        $candidates = [$value];
        if ($kind === 'name') {
            foreach (preg_split('/'.self::SPACE.'/u', $value, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $word) {
                $candidates[] = $word;
                $glued = '';
                foreach (preg_split('/[\-\x{2010}\x{2011}]+/u', $word, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $piece) {
                    $candidates[] = $piece;
                    $subparts = preg_split("/'+/u", $piece, -1, PREG_SPLIT_NO_EMPTY) ?: [];
                    if (count($subparts) > 1 || str_contains($piece, "'")) {
                        // « N'Diaye » : les parties, collé sans apostrophe, et l'apostrophe prise pour une espace.
                        array_push($candidates, ...$subparts);
                        $candidates[] = implode('', $subparts);
                        $candidates[] = implode(' ', $subparts);
                    }
                    $glued .= implode('', $subparts);
                }
                $candidates[] = $glued;
            }
        }
        foreach ($candidates as $index => $candidate) {
            $folded = $this->fold($candidate);
            $letters = (int) preg_match_all('/\p{L}/u', $folded);
            // Un mot de deux lettres d'un nom est un nom de famille possible, sauf un petit mot courant ; la valeur entière l'est toujours.
            $isTwoLetterWord = $kind === 'name' && $letters === 2 && preg_match('/^\p{L}{2}$/u', $folded) === 1;
            if ($isTwoLetterWord && ($index === 0 || ! in_array($folded, self::SHORT_STOP_WORDS, true))) {
                $needles[$folded.'|'.$token] = ['needle' => $folded, 'token' => $token];

                continue;
            }
            // Un seul caractère, ce n'est pas un nom.
            $significant = $kind === 'name' ? $letters : preg_match_all('/[\p{L}\p{N}]/u', $folded);
            if ($significant >= 3) {
                $needles[$folded.'|'.$token] = ['needle' => $folded, 'token' => $token];
            }
        }
    }

    /** @param array<string, array{needle: string, token: string}> $needles */
    private function replaceNeedles(string $text, array $needles): string
    {
        if ($text === '') {
            return $text;
        }

        $chars = preg_split('//u', mb_scrub($text, 'UTF-8'), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        // Deux formes repliées : A retire apostrophes et invisibles, B les prend pour une espace.
        // `$map*` : indice de code point replié → indice de caractère d'origine.
        $folded = '';
        $map = [];
        $spaced = '';
        $spacedMap = [];
        foreach ($chars as $index => $char) {
            if (preg_match(self::SEPARATOR, $char) === 1) {
                $spaced .= ' ';
                $spacedMap[] = $index;

                continue;
            }
            foreach (preg_split('//u', $this->fold($char), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $cp) {
                $folded .= $cp;
                $map[] = $index;
                $spaced .= $cp;
                $spacedMap[] = $index;
            }
        }

        // Un courriel ou un numéro est un seul bloc : « awa.diop@exemple.sn » ne doit pas devenir
        // « [NOM].[NOM]@exemple.sn ». Ces blocs passent avant tout nom au départage des chevauchements.
        // Chiffres pleine chasse et arabes-indiens ramenés à l'ASCII, un code point pour un : `$map` reste juste.
        $scan = PhoneMasker::normalizeDigits($folded);
        $spans = [];
        foreach ([[self::EMAIL, self::EMAIL_TOKEN], [PhoneMasker::PATTERN, PhoneMasker::TOKEN]] as [$pattern, $token]) {
            if (preg_match_all($pattern, $scan, $found, PREG_OFFSET_CAPTURE) === false) {
                throw new RuntimeException('ai.eval_anonymize_failed');
            }
            foreach ($found[0] as [$match, $byte]) {
                $spans[] = $this->span($scan, $map, $chars, $match, $byte, $token, 1);
            }
        }
        foreach ($needles as ['needle' => $needle, 'token' => $token]) {
            $parts = preg_split('/'.self::SPACE.'/u', $needle, -1, PREG_SPLIT_NO_EMPTY) ?: [];
            $body = implode(self::SPACE, array_map(fn (string $p): string => preg_quote($p, '/'), $parts));
            $pattern = '/(?<![\p{L}\p{N}])(?:'.$body.')(?![\p{L}\p{N}])/u';
            foreach ([[$folded, $map], [$spaced, $spacedMap]] as [$subject, $subjectMap]) {
                if (preg_match_all($pattern, $subject, $found, PREG_OFFSET_CAPTURE) === false) {
                    throw new RuntimeException('ai.eval_anonymize_failed');
                }
                foreach ($found[0] as [$match, $byte]) {
                    $span = $this->span($subject, $subjectMap, $chars, $match, $byte, $token, 0);
                    $spans[] = $token === self::NAME_TOKEN ? $this->withElidedLetter($span, $chars) : $span;
                }
            }
        }

        // Le plus long d'abord : « Awa Diop » l'emporte sur « Awa » et « Diop » qu'il contient.
        usort($spans, fn (array $a, array $b): int => $b['priority'] <=> $a['priority']
            ?: ($b['end'] - $b['start']) <=> ($a['end'] - $a['start'])
            ?: $a['start'] <=> $b['start']);
        $kept = [];
        foreach ($spans as $span) {
            foreach ($kept as $other) {
                if ($span['start'] <= $other['end'] && $span['end'] >= $other['start']) {
                    continue 2;
                }
            }
            $kept[] = $span;
        }
        usort($kept, fn (array $a, array $b): int => $a['start'] <=> $b['start']);

        $out = '';
        $cursor = 0;
        foreach ($kept as $span) {
            $out .= implode('', array_slice($chars, $cursor, $span['start'] - $cursor)).$span['token'];
            $cursor = $span['end'] + 1;
        }

        return $out.implode('', array_slice($chars, $cursor));
    }

    /**
     * « Diaye » dans « N'Diaye » : une lettre seule et une apostrophe juste avant la trouvaille font
     * partie du nom, sinon « N' » resterait dans le texte.
     *
     * @param  array{start: int, end: int, token: string, priority: int}  $span
     * @param  list<string>  $chars
     * @return array{start: int, end: int, token: string, priority: int}
     */
    private function withElidedLetter(array $span, array $chars): array
    {
        $start = $span['start'];
        if ($start >= 2
            && preg_match('/^['.self::APOSTROPHE_CHARS.']$/u', $chars[$start - 1]) === 1
            && preg_match('/^\p{L}$/u', $chars[$start - 2]) === 1
            && ($start === 2 || preg_match('/^[\p{L}\p{N}\p{Mn}]$/u', $chars[$start - 3]) !== 1)) {
            $span['start'] = $start - 2;
        }

        return $span;
    }

    /**
     * Une trouvaille dans le texte replié, ramenée aux indices de caractères du texte d'origine.
     *
     * @param  list<int>  $map
     * @param  list<string>  $chars
     * @return array{start: int, end: int, token: string, priority: int}
     */
    private function span(string $folded, array $map, array $chars, string $match, int $byte, string $token, int $priority): array
    {
        $first = mb_strlen(substr($folded, 0, $byte), 'UTF-8');
        $end = $map[$first + mb_strlen($match, 'UTF-8') - 1];
        // Les signes combinants qui suivent (texte décomposé) font partie de la dernière lettre.
        while (isset($chars[$end + 1]) && preg_match('/^\p{Mn}$/u', $chars[$end + 1]) === 1) {
            $end++;
        }

        return ['start' => $map[$first], 'end' => $end, 'token' => $token, 'priority' => $priority];
    }

    /**
     * Sans signes diacritiques, sans caractère invisible, avec une seule apostrophe, la casse gardée.
     * Les apostrophes (U+2019, U+2018, U+02BC, U+0060, U+00B4, U+2032, U+FF07) sont ramenées à U+0027.
     */
    private function strip(string $text): string
    {
        if (isset($this->stripCache[$text])) {
            return $this->stripCache[$text];
        }
        $this->folder ??= \Transliterator::create('NFD; [:Nonspacing Mark:] Remove; NFC')
            ?? throw new RuntimeException('ai.eval_anonymize_needs_intl');
        $clean = strtr(preg_replace(self::INVISIBLE, '', $text) ?? $text, self::APOSTROPHES);
        $stripped = $this->folder->transliterate($clean);

        return $this->stripCache[$text] = $stripped === false ? $clean : $stripped;
    }

    /** Forme de comparaison : sans signes diacritiques, ni apostrophe, en minuscules. */
    private function fold(string $text): string
    {
        return $this->foldCache[$text] ??= mb_strtolower(str_replace("'", '', $this->strip($text)), 'UTF-8');
    }

    /**
     * @param  array<int|string, mixed>  $values
     * @return array<int|string, mixed>
     */
    private function walk(array $values, ?string $inherited, Closure $clean): array
    {
        foreach ($values as $key => $value) {
            $kind = (is_string($key) ? $this->kindOf($key) : null) ?? $inherited;

            $values[$key] = match (true) {
                is_array($value) => $this->walk($value, $kind, $clean),
                $kind !== null && is_string($value) && trim($value) === '' => $value,
                $kind !== null && (is_string($value) || is_int($value) || is_float($value)) => $this->tokenOf($kind),
                is_string($value) => $clean($value),
                default => $value,
            };
        }

        return $values;
    }
}
