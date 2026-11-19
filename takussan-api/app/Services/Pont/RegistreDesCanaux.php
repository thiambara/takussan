<?php

namespace App\Services\Pont;

use Illuminate\Contracts\Container\Container;
use LogicException;

/**
 * TCK-2980 (ADR-0132 § 0) — les pilotes du pont, liés par la configuration : `config('messagerie.canaux')`, une
 * entrée par canal (`nom => ['actif' => bool, 'pilote' => classe]`). Le patron des pilotes du dépôt (un pilote par
 * valeur de config, `AppServiceProvider` pour le SMS et WhatsApp), sans `match` en code : un canal neuf ne touche
 * que la config. Les valeurs admises de `messages.channel` sont {@see self::APP} et ces noms : aucune énumération.
 */
final class RegistreDesCanaux
{
    /** `messages.channel` d'un message écrit dans l'application : la seule valeur que le code connaisse en dur. */
    public const APP = 'app';

    public function __construct(private readonly Container $container) {}

    /** Le pilote du canal ; lève si le canal n'est pas déclaré, ou si son pilote n'est pas ce canal. */
    public function canal(string $nom): CanalDuPont
    {
        $entree = config('messagerie.canaux.'.$nom);
        $classe = is_array($entree) ? ($entree['pilote'] ?? null) : null;
        if (! is_string($classe) || $classe === '') {
            throw new LogicException("Canal du pont inconnu : {$nom}.");
        }
        $canal = $this->container->make($classe);
        if (! $canal instanceof CanalDuPont || $canal->nom() !== $nom) {
            throw new LogicException("Le pilote {$classe} n'est pas le canal {$nom} du pont.");
        }

        return $canal;
    }

    /**
     * Le canal qui RECOIT par webhook : déclaré, actif, avec la capacité « reçoit » ; sinon `null` (le webhook rend
     * 404). Un nom venu de l'URL n'est jamais résolu hors de la config.
     */
    public function recepteur(string $nom): ?CanalDuPont
    {
        if (! in_array($nom, self::noms(), true) || ! (bool) config('messagerie.canaux.'.$nom.'.actif', false)) {
            return null;
        }
        $canal = $this->canal($nom);

        return $canal->capacites()->recoit ? $canal : null;
    }

    /** @return list<string> les noms déclarés */
    public static function noms(): array
    {
        return array_values(array_map('strval', array_keys((array) config('messagerie.canaux', []))));
    }

    /** Une valeur admise de `messages.channel`. */
    public static function estUnCanalDeMessage(string $valeur): bool
    {
        return $valeur === self::APP || in_array($valeur, self::noms(), true);
    }
}
