<?php

namespace App\Support\TempsReel;

use App\Models\User;
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
 * TCK-2955 (ADR-0129 § 2) — deux clés facultatives, nommées :
 *  - `'a' => fn (static $m): iterable<User|int>` : le signal part sur le canal PERSONNEL de chacun
 *    (`utilisateur.{id}`, {@see TempsReel::signalerA()}), avec le sujet pour `subject` — un seul envoi
 *    pour tous, découpé par paquets de 100. Sans elle, il part sur le canal du sujet.
 *  - `'attributs' => ['left_at', 'role']` : sur `updated`, le signal ne part que si l'une de ces colonnes
 *    a changé (`wasChanged`). Une écriture de `last_read_at` sur le pivot d'un participant n'émet ainsi pas
 *    `participants.updated` à tout le fil.
 *
 * @phpstan-require-extends Model
 */
trait EmetDesSignaux
{
    /** Les événements Eloquent que le trait sait écouter. */
    private static array $evenementsDeSignal = ['created', 'updated', 'deleted', 'restored', 'saved'];

    /**
     * @return array<string, list<array{0: CodeDeSignal, 1?: Closure(static): ?Model, a?: Closure(static): iterable<User|int>, attributs?: list<string>}>>
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
                    // TCK-2955 — le filtre des attributs : rien ne part si aucune colonne nommée n'a changé.
                    if (isset($declaration['attributs']) && ! $modele->wasChanged($declaration['attributs'])) {
                        continue;
                    }

                    $sujet = isset($declaration[1]) ? ($declaration[1])($modele) : $modele;
                    if (! $sujet instanceof Model) {
                        continue;
                    }

                    // TCK-2955 — vers les canaux personnels des destinataires, en un seul appel.
                    if (isset($declaration['a'])) {
                        TempsReel::signalerA(($declaration['a'])($modele), $declaration[0], $sujet);

                        continue;
                    }

                    TempsReel::signaler($sujet, $declaration[0]);
                }
            });
        }
    }
}
