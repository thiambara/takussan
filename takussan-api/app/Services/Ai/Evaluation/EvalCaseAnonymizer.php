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
 * sont masqués. `check-ai-evals-pii.mjs` garde le résultat ; aucun motif ne reconnaît un nom hors
 * champ personnel.
 *
 * Les mots de deux lettres d'un nom (« Ba », « Ly », « Sy ») sont des noms de famille sénégalais
 * courants et ne sont pas des syllabes : ils sont cherchés eux aussi, mais seulement en
 * majuscule initiale (ou tout en capitales), pour ne pas abîmer « ba » ou « el » partout. Un mot
 * abîmé vaut mieux qu'un nom qui fuit. Un mot d'une lettre n'est jamais cherché. Un nom à
 * apostrophe (« N'Diaye ») est cherché entier, par parties (« Diaye ») et collé (« NDiaye »),
 * quelle que soit l'apostrophe. Les caractères invisibles (U+200B, U+200C, U+200D, U+2060, U+FEFF,
 * U+00AD) sont ignorés à la comparaison : une trouvaille les englobe, donc ils disparaissent avec
 * elle ; ceux qui entourent un texte non personnel restent tels quels.
 */
final class EvalCaseAnonymizer
{
    public const NAME_TOKEN = '[NOM]';

    public const EMAIL_TOKEN = '[EMAIL]';

    public const ADDRESS_TOKEN = '[ADRESSE]';

    private const EMAIL = '/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/';

    private const SPACE = '[\s\x{00A0}\x{202F}]+';

    private const INVISIBLE = '/[\x{200B}\x{200C}\x{200D}\x{2060}\x{FEFF}\x{00AD}]/u';

    private const APOSTROPHES = ['’' => "'", 'ʼ' => "'"];

    /**
     * Un mot de la clé qui dit que la valeur n'est pas une personne : un compte, un type, un statut,
     * une préférence, un lieu (le quartier est la donnée que l'extraction doit retrouver).
     */
    private const NOT_PERSONAL = [
        'count', 'nombre', 'nb', 'type', 'preferred', 'prefere', 'statut', 'status',
        'quartier', 'neighbourhood', 'neighborhood', 'ville', 'city', 'zone', 'lieu',
    ];

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

        $clean = fn (string $text): string => (string) preg_replace(
            self::EMAIL,
            self::EMAIL_TOKEN,
            PhoneMasker::mask($this->replaceNeedles($text, $needles)),
        );

        return ['input' => $clean($input), 'expected' => $this->walk($expected, null, $clean)];
    }

    /** Le genre d'une clé personnelle (`phone`, `email`, `address`, `name`), ou null si elle ne l'est pas. */
    private function kindOf(string $key): ?string
    {
        $folded = $this->fold(preg_replace('/(?<=[a-z0-9])(?=[A-Z])/', '_', $key) ?? $key);
        $words = preg_split('/[^a-z]+/', $folded, -1, PREG_SPLIT_NO_EMPTY) ?: [];

        foreach ($words as $word) {
            if (in_array($word, self::NOT_PERSONAL, true) || (str_ends_with($word, 's') && in_array(substr($word, 0, -1), self::NOT_PERSONAL, true))) {
                return null;
            }
        }

        foreach (self::KINDS as $kind => $terms) {
            foreach ($terms['sub'] as $term) {
                if (str_contains($folded, $term)) {
                    return $kind;
                }
            }
            foreach ($words as $word) {
                foreach ($terms['word'] as $term) {
                    if ($word === $term || $word === $term.'s') {
                        return $kind;
                    }
                }
            }
        }

        return null;
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

    /** @param array<string, array{needle: string|list<string>, token: string, cs: bool}> $needles */
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
        foreach ($candidates as $candidate) {
            $folded = $this->fold($candidate);
            $letters = (int) preg_match_all('/\p{L}/u', $folded);
            // Un mot de deux lettres d'un nom est un nom de famille possible, cherché en majuscule initiale seulement.
            if ($kind === 'name' && $letters === 2 && preg_match('/^\p{L}{2}$/u', $folded) === 1) {
                $variants = array_values(array_unique([
                    mb_strtoupper(mb_substr($candidate, 0, 1, 'UTF-8'), 'UTF-8').mb_strtolower(mb_substr($candidate, 1, null, 'UTF-8'), 'UTF-8'),
                    mb_strtoupper($candidate, 'UTF-8'),
                ]));
                $needles['cs|'.implode('|', $variants).'|'.$token] = ['needle' => $variants, 'token' => $token, 'cs' => true];

                continue;
            }
            // Un seul caractère, ce n'est pas un nom ; et un nom d'une seule lettre sous trois n'est jamais cherché en minuscule.
            $significant = $kind === 'name' ? $letters : preg_match_all('/[\p{L}\p{N}]/u', $folded);
            if ($significant >= 3) {
                $needles[$folded.'|'.$token] = ['needle' => $folded, 'token' => $token, 'cs' => false];
            }
        }
    }

    /** @param array<string, array{needle: string|list<string>, token: string, cs: bool}> $needles */
    private function replaceNeedles(string $text, array $needles): string
    {
        if ($text === '') {
            return $text;
        }

        $chars = preg_split('//u', mb_scrub($text, 'UTF-8'), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $folded = '';
        $map = []; // indice de code point replié → indice de caractère d'origine
        $cased = ''; // même texte sans les accents mais avec sa casse, pour les mots de deux lettres
        $casedMap = [];
        foreach ($chars as $index => $char) {
            foreach (preg_split('//u', $this->fold($char), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $cp) {
                $folded .= $cp;
                $map[] = $index;
            }
            foreach (preg_split('//u', $this->strip($char), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $cp) {
                $cased .= $cp;
                $casedMap[] = $index;
            }
        }

        // Un courriel ou un numéro est un seul bloc : « awa.diop@exemple.sn » ne doit pas devenir
        // « [NOM].[NOM]@exemple.sn ». Ces blocs passent avant tout nom au départage des chevauchements.
        $spans = [];
        foreach ([[self::EMAIL, self::EMAIL_TOKEN], [PhoneMasker::PATTERN, PhoneMasker::TOKEN]] as [$pattern, $token]) {
            if (preg_match_all($pattern, $folded, $found, PREG_OFFSET_CAPTURE) === false) {
                throw new RuntimeException('ai.eval_anonymize_failed');
            }
            foreach ($found[0] as [$match, $byte]) {
                $spans[] = $this->span($folded, $map, $chars, $match, $byte, $token, 1);
            }
        }
        foreach ($needles as ['needle' => $needle, 'token' => $token, 'cs' => $cs]) {
            if ($cs) {
                $body = implode('|', array_map(fn (string $v): string => preg_quote($v, '/'), (array) $needle));
                $subject = $cased;
                $subjectMap = $casedMap;
            } else {
                $parts = preg_split('/'.self::SPACE.'/u', (string) $needle, -1, PREG_SPLIT_NO_EMPTY) ?: [];
                $body = implode(self::SPACE, array_map(fn (string $p): string => preg_quote($p, '/'), $parts));
                $subject = $folded;
                $subjectMap = $map;
            }
            $pattern = '/(?<![\p{L}\p{N}])(?:'.$body.')(?![\p{L}\p{N}])/u';
            if (preg_match_all($pattern, $subject, $found, PREG_OFFSET_CAPTURE) === false) {
                throw new RuntimeException('ai.eval_anonymize_failed');
            }
            foreach ($found[0] as [$match, $byte]) {
                $spans[] = $this->span($subject, $subjectMap, $chars, $match, $byte, $token, 0);
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
     * Les apostrophes (U+2019, U+02BC) sont ramenées à U+0027 : « N’Diaye » est « N'Diaye ».
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

    /** Forme de comparaison : sans signes diacritiques, en minuscules. */
    private function fold(string $text): string
    {
        return $this->foldCache[$text] ??= mb_strtolower($this->strip($text), 'UTF-8');
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
