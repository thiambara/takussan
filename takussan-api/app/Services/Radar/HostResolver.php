<?php

namespace App\Services\Radar;

/**
 * TCK-2386 (ADR-0077 §10) — la résolution DNS d'un nom d'hôte, injectée : `UrlFetcher` contrôle
 * TOUTES les adresses rendues avant de se connecter, et les tests la doublent (aucun test ne
 * touche le réseau).
 */
interface HostResolver
{
    /**
     * Les adresses IPv4 et IPv6 du nom, sous leur forme textuelle ; liste vide si le nom ne résout pas.
     *
     * @return list<string>
     */
    public function resolve(string $host): array;
}
