<?php

namespace App\Support\Logging;

use Illuminate\Database\QueryException;
use Throwable;

/**
 * TCK-601 (ADR-0044 §2) — la SEULE forme d'une exception dans un journal.
 *
 * Le message d'une exception est une DONNÉE, pas un diagnostic : celui d'une `QueryException`
 * recopie les valeurs liées (`Str::replaceArray('?', $bindings, $sql)`) et le `DETAIL` d'une
 * violation PostgreSQL cite la valeur fautive ; un refus SMTP recopie l'adresse du destinataire ;
 * une `ValidationException`, la valeur refusée. L'objet exception lui-même n'est pas plus sûr : sa
 * trace porte les arguments des appels quand `zend.exception_ignore_args` est `Off`.
 *
 * Ce qui reste suffit à retrouver la cause : la classe, le code, le point de levée, la pile réduite
 * à `fichier:ligne` — et pour une erreur SQL, le SQLSTATE et la requête à placeholders, avec le
 * NOMBRE de valeurs liées. **Jamais `getMessage()`**, d'aucune exception ni de ses `getPrevious()`.
 * Un appelant qui a besoin d'un texte le compose à partir de codes.
 */
final class SafeExceptionContext
{
    private const MAX_FRAMES = 15;

    /** @return array<string, mixed> */
    public static function of(Throwable $e): array
    {
        $context = [
            'exception' => $e::class,
            'code' => $e->getCode(),
            'at' => self::location($e->getFile(), $e->getLine()),
        ];

        if ($e instanceof QueryException) {
            $context += [
                'sqlstate' => $e->errorInfo[0] ?? (is_string($e->getCode()) ? $e->getCode() : null),
                'sql' => $e->getSql(),
                'connection' => $e->connectionName,
                'bindings_count' => count($e->getBindings()),
            ];
        }

        $previous = $e->getPrevious();
        if ($previous !== null) {
            $context['previous'] = $previous::class;
        }

        $context['trace'] = self::trace($e);

        return $context;
    }

    /** @return list<string> */
    private static function trace(Throwable $e): array
    {
        $frames = [];
        foreach (array_slice($e->getTrace(), 0, self::MAX_FRAMES) as $frame) {
            if (isset($frame['file'])) {
                $frames[] = self::location($frame['file'], $frame['line'] ?? 0);
            }
        }

        return $frames;
    }

    private static function location(string $file, int $line): string
    {
        $base = base_path().DIRECTORY_SEPARATOR;

        return (str_starts_with($file, $base) ? substr($file, strlen($base)) : $file).':'.$line;
    }
}
