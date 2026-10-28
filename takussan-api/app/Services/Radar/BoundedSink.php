<?php

namespace App\Services\Radar;

use GuzzleHttp\Psr7\StreamDecoratorTrait;
use GuzzleHttp\Psr7\Utils;
use Psr\Http\Message\StreamInterface;

/**
 * TCK-2386 (ADR-0077 §10) — le tampon où le client HTTP écrit le corps reçu (option `sink`), borné.
 *
 * Le gestionnaire cURL de Guzzle écrit chaque morceau reçu par `write()` et rend à cURL le nombre
 * d'octets acceptés ; rendre 0 fait interrompre le transfert (CURLE_WRITE_ERROR). Un serveur qui
 * envoie un corps sans fin, en `Transfer-Encoding: chunked` et sans `Content-Length`, ne fait donc
 * jamais tenir plus de `$maxBytes` octets en mémoire.
 *
 * ⚠ `Http::fake()` n'emprunte pas ce chemin : il ne prouve que les contrôles faits APRÈS lecture
 * (en-tête et taille du corps). Ce tampon a son propre test.
 */
final class BoundedSink implements StreamInterface
{
    use StreamDecoratorTrait;

    public bool $exceeded = false;

    private StreamInterface $stream;

    public function __construct(private readonly int $maxBytes)
    {
        $this->stream = Utils::streamFor(Utils::tryFopen('php://temp', 'w+'));
    }

    public function write($string): int
    {
        if ($this->exceeded || ($this->stream->getSize() ?? 0) + strlen($string) > $this->maxBytes) {
            $this->exceeded = true;

            return 0;
        }

        return $this->stream->write($string);
    }
}
