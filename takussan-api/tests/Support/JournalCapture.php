<?php

namespace Tests\Support;

use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Throwable;

/**
 * TCK-601 (ADR-0044 §2) — capture TOUTES les entrées de journal d'un test, pour affirmer qu'aucune
 * ne porte une valeur témoin. Chaque entrée est rendue en texte : le message, puis le contexte, où
 * tout `Throwable` est rendu par `(string) $e` — message ET trace — comme un gestionnaire de journal
 * le ferait.
 */
trait JournalCapture
{
    /** @var list<array{level: string, message: string, context: array<string, mixed>, text: string}> */
    protected array $journal = [];

    protected function captureJournal(): void
    {
        $this->journal = [];
        Event::listen(MessageLogged::class, function (MessageLogged $event): void {
            $this->journal[] = [
                'level' => $event->level,
                'message' => (string) $event->message,
                'context' => $event->context,
                'text' => $event->message.' '.self::renderContext($event->context),
            ];
        });
    }

    protected function assertJournalSansTemoin(string ...$temoins): void
    {
        foreach ($this->journal as $entry) {
            foreach ($temoins as $temoin) {
                $this->assertStringNotContainsString($temoin, $entry['text'], "Entrée « {$entry['message']} » : le témoin {$temoin} est journalisé.");
            }
        }
    }

    /** @return list<array{level: string, message: string, context: array<string, mixed>, text: string}> */
    protected function entreesJournal(string $message): array
    {
        return array_values(array_filter($this->journal, fn (array $e): bool => $e['message'] === $message));
    }

    private static function renderContext(mixed $value): string
    {
        if ($value instanceof Throwable) {
            return (string) $value;
        }
        if (is_array($value)) {
            return implode(' ', array_map(fn ($v, $k) => $k.'='.self::renderContext($v), $value, array_keys($value)));
        }
        if (is_object($value)) {
            return method_exists($value, '__toString') ? (string) $value : (string) json_encode($value);
        }

        return (string) json_encode($value);
    }
}
