<?php

namespace App\Support\Logging;

use DateTimeInterface;
use Illuminate\Queue\Failed\CountableFailedJobProvider;
use Illuminate\Queue\Failed\FailedJobProviderInterface;
use Illuminate\Queue\Failed\PrunableFailedJobProvider;
use Throwable;

/**
 * TCK-601 (ADR-0044 §2) — `failed_jobs.exception` sans donnée personnelle.
 *
 * Le fournisseur du framework écrit `(string) $exception` : le message (valeurs liées d'une erreur
 * SQL, adresse refusée par un serveur SMTP…) et la trace avec ses arguments. Ce décorateur de
 * `queue.failer` écrit à la place la forme sûre de {@see SafeExceptionContext}, rendue en texte
 * pour la console des jobs échoués. Le `payload` n'est PAS touché : il est nécessaire au rejeu.
 *
 * Écarté (ADR-0044) : une purge périodique — la donnée vit jusqu'au passage ; et
 * `zend.exception_ignore_args` seul — il ne retire pas les valeurs du message.
 */
final class SanitizingFailedJobProvider implements CountableFailedJobProvider, FailedJobProviderInterface, PrunableFailedJobProvider
{
    public function __construct(private readonly FailedJobProviderInterface $inner) {}

    public function log($connection, $queue, $payload, $exception)
    {
        return $this->inner->log($connection, $queue, $payload, $exception instanceof Throwable ? self::render($exception) : $exception);
    }

    public static function render(Throwable $e): string
    {
        $context = SafeExceptionContext::of($e);

        $lines = [sprintf('%s [code %s] at %s', $context['exception'], (string) $context['code'], $context['at'])];
        if (isset($context['sqlstate'])) {
            $lines[] = sprintf('SQLSTATE %s — %s (%d bindings, connection %s)', $context['sqlstate'], $context['sql'], $context['bindings_count'], $context['connection']);
        }
        if (isset($context['previous'])) {
            $lines[] = 'previous: '.$context['previous'];
        }
        foreach ($context['trace'] as $index => $frame) {
            $lines[] = '#'.$index.' '.$frame;
        }

        return implode("\n", $lines);
    }

    public function ids($queue = null)
    {
        return $this->inner->ids($queue);
    }

    public function all()
    {
        return $this->inner->all();
    }

    public function find($id)
    {
        return $this->inner->find($id);
    }

    public function forget($id)
    {
        return $this->inner->forget($id);
    }

    public function flush($hours = null)
    {
        $this->inner->flush($hours);
    }

    public function count($connection = null, $queue = null)
    {
        return $this->inner instanceof CountableFailedJobProvider ? $this->inner->count($connection, $queue) : count($this->inner->all());
    }

    public function prune(DateTimeInterface $before)
    {
        return $this->inner instanceof PrunableFailedJobProvider ? $this->inner->prune($before) : 0;
    }
}
