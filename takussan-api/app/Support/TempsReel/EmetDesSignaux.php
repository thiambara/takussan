<?php

namespace App\Support\TempsReel;

use Closure;
use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * TCK-2952 (ADR-0129 § 3) — le trait de modèle : il déclare quels événements Eloquent émettent quel code, sur
 * quel sujet, et passe par {@see TempsReel}. Le modèle n'écrit rien d'autre :
 *
 * ```php
 * use EmetDesSignaux;
 *
 * protected static function signauxTempsReel(): array
 * {
 *     return [
 *         'created' => [[CodeDeSignal::MessageCreated, fn (Message $m) => $m->conversation]],
 *         'updated' => [[CodeDeSignal::MessageUpdated, fn (Message $m) => $m->conversation]],
 *     ];
 * }
 * ```
 *
 * Le second élément rend le SUJET (un modèle du registre {@see CanauxTempsReel}), ou `null` pour ne rien
 * émettre ; absent, le sujet est le modèle lui-même. L'émission attend le COMMIT comme toute autre.
 *
 * @phpstan-require-extends Model
 */
trait EmetDesSignaux
{
    /** Les événements Eloquent que le trait sait écouter. */
    private static array $evenementsDeSignal = ['created', 'updated', 'deleted', 'restored', 'saved'];

    /**
     * @return array<string, list<array{0: CodeDeSignal, 1?: Closure(static): ?Model}>>
     */
    abstract protected static function signauxTempsReel(): array;

    public static function bootEmetDesSignaux(): void
    {
        foreach (static::signauxTempsReel() as $evenement => $declarations) {
            if (! in_array($evenement, self::$evenementsDeSignal, true)) {
                throw new LogicException(sprintf('%s : l\'événement « %s » n\'émet pas de signal.', static::class, $evenement));
            }

            static::registerModelEvent($evenement, function (Model $modele) use ($declarations): void {
                foreach ($declarations as $declaration) {
                    $sujet = isset($declaration[1]) ? ($declaration[1])($modele) : $modele;
                    if ($sujet instanceof Model) {
                        TempsReel::signaler($sujet, $declaration[0]);
                    }
                }
            });
        }
    }
}
