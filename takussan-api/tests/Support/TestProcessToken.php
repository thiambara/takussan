<?php

namespace Tests\Support;

/**
 * Le jeton qui identifie CE processus de test.
 *
 * Deux ressources partagées par machine se détruisaient mutuellement quand
 * deux exécutions de la suite se chevauchaient — les index Meilisearch
 * (cf. {@see TestSearchIndex}) et la racine des disques `Storage::fake()`
 * (cf. {@see TestFilesystemIsolation}). Les deux se règlent par le même moyen,
 * un discriminant par processus : il n'existe donc qu'ici, et une seule fois.
 *
 * pid ET aléa : le pid seul est réutilisé par le système, et deux exécutions
 * successives se marcheraient dessus si la première a été tuée avant son
 * nettoyage. Format hexadécimal, sans séparateur, pour rester un identifiant
 * valide partout (nom d'index Meilisearch, nom de répertoire).
 */
final class TestProcessToken
{
    private static ?string $value = null;

    public static function value(): string
    {
        return self::$value ??= dechex(getmypid() ?: 0).bin2hex(random_bytes(3));
    }
}
