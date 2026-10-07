<?php

namespace Tests\Support;

use PhpToken;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * TCK-588 (ADR-0032) — trouve la prose écrite en dur aux endroits où l'API la renvoie à un écran.
 *
 * Sept positions, lettres du ticket :
 *
 *   (a) le message d'un `abort()`, `abort_if()`, `abort_unless()` ;
 *   (b) le titre ou le corps d'un `->notify(`/`->notifyMany(` à quatre arguments ou plus
 *       (`NotificationService`, pas le `notify()` d'un `Notifiable`) ;
 *   (c) dans `Notifications/**` : le premier argument de `->subject|line|greeting|action|salutation(`
 *       et la valeur de `'title' =>` / `'body' =>` ;
 *   (d) la valeur de `'message' =>`, hors des appels de journalisation ;
 *   (e) le message de `new *HttpException(` et les valeurs de `ValidationException::withMessages(` ;
 *   (f) `new HttpResponseException(`, sans condition : elle contourne le rendu de `bootstrap/app.php` ;
 *   (g) `number_format(` dans `Notifications/**`, sans condition : un montant passe par
 *       `CurrencyFormatter`, dans la langue du destinataire.
 *
 * Aux positions (a)-(e), **tout** littéral qui contient une lettre compte, même imbriqué dans un
 * `sprintf(`, une concaténation, un tableau ou une chaîne interpolée — le cas
 * `PlatformReportingService` mettait sa phrase dans un `sprintf` à l'intérieur de `withMessages` :
 * un relevé qui ne regarde que le premier niveau ne la voit pas. Ne comptent pas : le contenu d'un
 * `__()`/`trans()`/`trans_choice()` (une clé n'est pas de la prose), une clé de tableau, et les
 * spécificateurs de `sprintf` (`%s`, `%d`).
 *
 * ⚠ **Le tokenizer n'est pas une coquetterie** : un `grep` mono-ligne annonçait 94 aborts littéraux
 * là où il y en avait 186 — il ne voit ni les appels sur plusieurs lignes ni les services.
 */
final class ProseLitteraleScanner
{
    public const ABORT = 'a';

    public const NOTIFY = 'b';

    public const NOTIFICATION_CLASS = 'c';

    public const MESSAGE_KEY = 'd';

    public const HTTP_EXCEPTION = 'e';

    public const HTTP_RESPONSE_EXCEPTION = 'f';

    public const NUMBER_FORMAT = 'g';

    /** Position du message dans chaque forme d'abort. */
    private const ABORTS = ['abort' => 1, 'abort_if' => 2, 'abort_unless' => 2];

    /** Méthodes de `MailMessage` dont le premier argument s'affiche. */
    private const MAIL_METHODS = ['subject', 'line', 'greeting', 'action', 'salutation'];

    /** Appels dont le contenu est une clé, ou une donnée de journal : jamais de la prose affichée. */
    private const TRANSLATORS = ['__', 'trans', 'trans_choice'];

    private const LOG_FUNCTIONS = ['logger', 'info', 'report', 'activity'];

    private const LOG_METHODS = [
        'log', 'debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency',
        'withProperties',
    ];

    /**
     * Un code, pas une phrase : `ok`, `deleted`, `enum_value_exists`, `unknown_placeholder:`. Toléré
     * aux deux seules positions où l'API a toujours rendu des codes à côté de la prose — la valeur de
     * `'message' =>` (accusés `ok`/`deleted`) et celle de `ValidationException::withMessages` (codes
     * que le front traduit). **Jamais pour un `abort`** : un code d'abort passe par `abort_code()`,
     * dont la clé est vérifiée en trois langues.
     */
    private const CODE_SHAPE = '/^[a-z0-9_]+([.:][a-z0-9_]+)*:?$/';

    /** Nombre d'appels reconnus au dernier scan, toutes positions confondues. */
    public int $appelsReconnus = 0;

    /** Nombre de fichiers lus au dernier scan. */
    public int $fichiersLus = 0;

    /**
     * Les `abort*()` dont le message n'est PAS un littéral — `abort(403, __('…'))`, une variable.
     * Pas de la prose en dur, mais un message PERDU : `bootstrap/app.php` rend toute
     * `HttpException` hors `ApiError` en `http.<statut>`. Relevé à part des formes (a)-(g).
     *
     * @var list<array{file: string, line: int}>
     */
    public array $messagesPerdus = [];

    /**
     * @return list<array{file: string, line: int, form: string, literal: string}>
     */
    public function scanDirectory(string $root): array
    {
        $this->appelsReconnus = 0;
        $this->fichiersLus = 0;
        $this->messagesPerdus = [];
        $findings = [];
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, RecursiveDirectoryIterator::SKIP_DOTS));
        $files = [];
        foreach ($iterator as $file) {
            if ($file->isFile() && $file->getExtension() === 'php') {
                $files[] = $file->getPathname();
            }
        }
        sort($files);
        foreach ($files as $path) {
            $relative = ltrim(substr($path, strlen(rtrim($root, '/'))), '/');
            $this->fichiersLus++;
            $perdus = count($this->messagesPerdus);
            foreach ($this->scanSource((string) file_get_contents($path), str_starts_with($relative, 'Notifications/')) as $finding) {
                $findings[] = ['file' => $relative] + $finding;
            }
            for ($k = $perdus; $k < count($this->messagesPerdus); $k++) {
                $this->messagesPerdus[$k]['file'] = $relative;
            }
        }

        return $findings;
    }

    /**
     * @return list<array{line: int, form: string, literal: string}>
     */
    public function scanSource(string $source, bool $isNotificationClass): array
    {
        $t = array_values(array_filter(
            PhpToken::tokenize($source),
            fn (PhpToken $token) => ! $token->is([T_WHITESPACE, T_COMMENT, T_DOC_COMMENT, T_OPEN_TAG, T_INLINE_HTML]),
        ));
        $logRanges = [...$this->logRanges($t), ...$this->declarationRanges($t)];
        $findings = [];
        $n = count($t);

        for ($i = 0; $i < $n; $i++) {
            $tok = $t[$i];
            $prev = $t[$i - 1] ?? null;
            $next = $t[$i + 1] ?? null;
            $name = ltrim($tok->text, '\\');
            $isCall = $next !== null && $next->text === '(';
            $isMethod = $prev !== null && in_array($prev->text, ['->', '?->'], true);
            $isFunction = $isCall && ! $isMethod && ! ($prev !== null && in_array($prev->text, ['::', 'function', 'new', 'const'], true));

            // (a) abort*()
            if ($isFunction && $tok->is([T_STRING, T_NAME_FULLY_QUALIFIED]) && isset(self::ABORTS[$name])) {
                $this->appelsReconnus++;
                $args = $this->arguments($t, $i + 1);
                $arg = $args[self::ABORTS[$name]] ?? null;
                if ($arg !== null) {
                    $prose = $this->prose($t, $arg, self::ABORT);
                    $findings = [...$findings, ...$prose];
                    if ($prose === []) {
                        $this->messagesPerdus[] = ['file' => '', 'line' => $tok->line];
                    }
                }

                continue;
            }

            // (b) ->notify( / ->notifyMany( de NotificationService
            if ($isMethod && $isCall && in_array($tok->text, ['notify', 'notifyMany'], true)) {
                $args = $this->arguments($t, $i + 1);
                if (count($args) >= 4) {
                    $this->appelsReconnus++;
                    foreach ([2, 3] as $index) {
                        $findings = [...$findings, ...$this->prose($t, $args[$index], self::NOTIFY)];
                    }
                }

                continue;
            }

            // (c) MailMessage dans Notifications/**
            if ($isNotificationClass && $isMethod && $isCall && in_array($tok->text, self::MAIL_METHODS, true)) {
                $this->appelsReconnus++;
                $args = $this->arguments($t, $i + 1);
                if (isset($args[0])) {
                    $findings = [...$findings, ...$this->prose($t, $args[0], self::NOTIFICATION_CLASS)];
                }

                continue;
            }

            // (c) 'title' => / 'body' => dans Notifications/**, (d) 'message' => partout
            if ($tok->is(T_CONSTANT_ENCAPSED_STRING) && $next !== null && $next->text === '=>') {
                $key = substr($tok->text, 1, -1);
                $form = match (true) {
                    $key === 'message' => self::MESSAGE_KEY,
                    $isNotificationClass && in_array($key, ['title', 'body'], true) => self::NOTIFICATION_CLASS,
                    default => null,
                };
                if ($form !== null && ! $this->inRanges($i, $logRanges)) {
                    $this->appelsReconnus++;
                    $findings = [...$findings, ...$this->prose($t, $this->valueRange($t, $i + 2), $form, $form === self::MESSAGE_KEY)];
                }

                continue;
            }

            // (e) / (f) new *HttpException(
            if ($tok->is(T_NEW) && $next !== null && $next->is([T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED])) {
                $class = $next->text;
                if (str_ends_with($class, 'HttpResponseException')) {
                    $this->appelsReconnus++;
                    $findings[] = ['line' => $tok->line, 'form' => self::HTTP_RESPONSE_EXCEPTION, 'literal' => 'new '.$class];
                } elseif (str_ends_with($class, 'HttpException') && ($t[$i + 2]->text ?? null) === '(') {
                    $this->appelsReconnus++;
                    $args = $this->arguments($t, $i + 2);
                    $arg = $args[preg_match('/(^|\\\\)HttpException$/', $class) ? 1 : 0] ?? null;
                    if ($arg !== null) {
                        $findings = [...$findings, ...$this->prose($t, $arg, self::HTTP_EXCEPTION)];
                    }
                }

                continue;
            }

            // (e) ValidationException::withMessages(
            if ($tok->text === 'withMessages' && $isCall && $prev !== null && $prev->text === '::') {
                $this->appelsReconnus++;
                $args = $this->arguments($t, $i + 1);
                if (isset($args[0])) {
                    $findings = [...$findings, ...$this->prose($t, $args[0], self::HTTP_EXCEPTION, true)];
                }

                continue;
            }

            // (g) number_format( dans Notifications/**
            if ($isNotificationClass && $isFunction && $name === 'number_format') {
                $this->appelsReconnus++;
                $findings[] = ['line' => $tok->line, 'form' => self::NUMBER_FORMAT, 'literal' => 'number_format('];
            }
        }

        $unique = [];
        foreach ($findings as $finding) {
            $unique[$finding['line'].'|'.$finding['form'].'|'.$finding['literal']] = $finding;
        }

        return array_values($unique);
    }

    /**
     * Les littéraux à lettre d'une plage de jetons, hors traducteurs et clés de tableau.
     *
     * @param  list<PhpToken>  $t
     * @param  array{0: int, 1: int}  $range  bornes incluses
     * @return list<array{line: int, form: string, literal: string}>
     */
    private function prose(array $t, array $range, string $form, bool $codesTolerated = false): array
    {
        $found = [];
        [$from, $to] = $range;
        for ($i = $from; $i <= $to; $i++) {
            $tok = $t[$i];
            if ($tok->is(T_STRING) && in_array($tok->text, [...self::TRANSLATORS, 'config'], true) && ($t[$i + 1]->text ?? null) === '(') {
                $i = $this->closing($t, $i + 1);

                continue;
            }
            // Les arguments d'une MÉTHODE (`$this->render($n, 'mail_subject')`, `Number::format(…)`)
            // calculent une valeur : ce sont des identifiants, pas le texte affiché. Une FONCTION
            // (`sprintf`, `implode`) reste lue — c'est elle qui porte une phrase imbriquée.
            if ($tok->is(T_STRING) && in_array($t[$i - 1]->text ?? null, ['->', '?->', '::'], true) && ($t[$i + 1]->text ?? null) === '(') {
                $i = $this->closing($t, $i + 1);

                continue;
            }
            // Une chaîne interpolée employée comme clé de tableau (`"templates.{$locale}.body" =>`).
            if ($tok->text === '"') {
                $end = $i + 1;
                while ($end <= $to && $t[$end]->text !== '"') {
                    $end++;
                }
                if (($t[$end + 1]->text ?? null) === '=>') {
                    $i = $end;

                    continue;
                }
            }
            if ($tok->is(T_CONSTANT_ENCAPSED_STRING)) {
                if (($t[$i + 1]->text ?? null) === '=>' || $this->isSubscript($t, $i)) {
                    continue;
                }
                $content = $tok->text[0] === '"'
                    ? stripcslashes(substr($tok->text, 1, -1))
                    : str_replace(["\\'", '\\\\'], ["'", '\\'], substr($tok->text, 1, -1));
            } elseif ($tok->is(T_ENCAPSED_AND_WHITESPACE)) {
                $content = stripcslashes($tok->text);
            } else {
                continue;
            }
            if ($codesTolerated && preg_match(self::CODE_SHAPE, $content)) {
                continue;
            }
            $sansFormat = (string) preg_replace('/%(\d+\$)?[-+ 0#\']*\d*(\.\d+)?[bcdeEfFgGosuxX]/', '', $content);
            if (preg_match('/\p{L}/u', $sansFormat)) {
                $found[] = ['line' => $tok->line, 'form' => $form, 'literal' => $content];
            }
        }

        return $found;
    }

    /** `$x['message']`, `$a[0]['body']` : un indice n'est pas un texte. */
    private function isSubscript(array $t, int $i): bool
    {
        return ($t[$i - 1]->text ?? null) === '['
            && ($t[$i + 1]->text ?? null) === ']'
            && isset($t[$i - 2])
            && ($t[$i - 2]->is([T_VARIABLE, T_STRING]) || in_array($t[$i - 2]->text, [']', ')', '}'], true));
    }

    /**
     * Les arguments d'un appel, en plages de jetons, à partir de sa parenthèse ouvrante.
     *
     * @param  list<PhpToken>  $t
     * @return list<array{0: int, 1: int}>
     */
    private function arguments(array $t, int $open): array
    {
        $close = $this->closing($t, $open);
        $args = [];
        $start = $open + 1;
        $depth = 0;
        for ($i = $open + 1; $i < $close; $i++) {
            $text = $t[$i]->text;
            if ($this->opens($t[$i])) {
                $depth++;
            } elseif (in_array($text, [')', ']', '}'], true)) {
                $depth--;
            } elseif ($text === ',' && $depth === 0) {
                $args[] = [$start, $i - 1];
                $start = $i + 1;
            }
        }
        if ($start <= $close - 1) {
            $args[] = [$start, $close - 1];
        }

        return $args;
    }

    /**
     * La valeur d'un élément de tableau qui commence à `$start` : jusqu'à la virgule ou au
     * crochet fermant de son niveau.
     *
     * @param  list<PhpToken>  $t
     * @return array{0: int, 1: int}
     */
    private function valueRange(array $t, int $start): array
    {
        $depth = 0;
        $n = count($t);
        for ($i = $start; $i < $n; $i++) {
            if ($this->opens($t[$i])) {
                $depth++;
            } elseif (in_array($t[$i]->text, [')', ']', '}'], true)) {
                if ($depth === 0) {
                    return [$start, $i - 1];
                }
                $depth--;
            } elseif (in_array($t[$i]->text, [',', ';'], true) && $depth === 0) {
                return [$start, $i - 1];
            }
        }

        return [$start, $n - 1];
    }

    /** @param list<PhpToken> $t */
    private function closing(array $t, int $open): int
    {
        $depth = 0;
        $n = count($t);
        for ($i = $open; $i < $n; $i++) {
            if ($this->opens($t[$i])) {
                $depth++;
            } elseif (in_array($t[$i]->text, [')', ']', '}'], true)) {
                $depth--;
                if ($depth === 0) {
                    return $i;
                }
            }
        }

        return $n - 1;
    }

    private function opens(PhpToken $token): bool
    {
        return in_array($token->text, ['(', '[', '{'], true)
            || $token->is([T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES]);
    }

    /**
     * Les plages d'arguments des appels de journalisation : un `'message' =>` y décrit un
     * événement pour l'exploitant, il n'atteint aucun écran.
     *
     * @param  list<PhpToken>  $t
     * @return list<array{0: int, 1: int}>
     */
    private function logRanges(array $t): array
    {
        $ranges = [];
        $n = count($t);
        for ($i = 0; $i < $n - 1; $i++) {
            if ($t[$i + 1]->text !== '(') {
                continue;
            }
            $prev = $t[$i - 1] ?? null;
            $prevText = $prev?->text;
            $isLog = ($prevText === '::' && in_array(ltrim($t[$i - 2]->text ?? '', '\\'), ['Log', 'Illuminate\Support\Facades\Log'], true))
                || (in_array($prevText, ['->', '?->'], true) && in_array($t[$i]->text, self::LOG_METHODS, true))
                || (! in_array($prevText, ['->', '?->', '::', 'function', 'new'], true) && in_array(ltrim($t[$i]->text, '\\'), self::LOG_FUNCTIONS, true));
            if ($isLog) {
                $ranges[] = [$i + 1, $this->closing($t, $i + 1)];
            }
        }

        return $ranges;
    }

    /**
     * Les déclarations de constantes et le corps des méthodes `rules()` : un champ de formulaire
     * nommé `message` (`'message' => ['required', 'string']`) ou une table de correspondance
     * (`'message' => 'message_received'`) ne sont pas des réponses.
     *
     * @param  list<PhpToken>  $t
     * @return list<array{0: int, 1: int}>
     */
    private function declarationRanges(array $t): array
    {
        $ranges = [];
        $n = count($t);
        for ($i = 0; $i < $n; $i++) {
            if ($t[$i]->is(T_CONST)) {
                $end = $i;
                while ($end < $n && $t[$end]->text !== ';') {
                    $end++;
                }
                $ranges[] = [$i, $end];
            } elseif ($t[$i]->is(T_FUNCTION) && ($t[$i + 1]->text ?? null) === 'rules') {
                $open = $i;
                while ($open < $n && $t[$open]->text !== '{') {
                    $open++;
                }
                $ranges[] = [$open, $this->closing($t, $open)];
            }
        }

        return $ranges;
    }

    /** @param list<array{0: int, 1: int}> $ranges */
    private function inRanges(int $i, array $ranges): bool
    {
        foreach ($ranges as [$from, $to]) {
            if ($i >= $from && $i <= $to) {
                return true;
            }
        }

        return false;
    }
}
