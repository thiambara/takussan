<?php

namespace Tests\Support;

/**
 * Le jeton qui identifie CE processus de test.
 *
 * Deux ressources partagées par machine se détruisaient mutuellement quand deux
 * exécutions de la suite se chevauchaient — les index Meilisearch
 * (cf. {@see TestSearchIndex}) et la racine des disques `Storage::fake()`
 * (cf. {@see TestFilesystemIsolation}). Les deux se règlent par le même moyen, un
 * discriminant par processus : il n'existe donc qu'ici, et une seule fois.
 *
 * pid ET aléa : le pid seul est réutilisé par le système, et deux exécutions
 * successives se marcheraient dessus si la première a été tuée avant son nettoyage.
 * Format hexadécimal, sans séparateur, pour rester un identifiant valide partout
 * (nom d'index Meilisearch, nom de répertoire).
 *
 * ⚠ DEUX ÉTAGES, ET IL FAUT LES DEUX (phase 2, TCK-321). En `--parallel`, Laravel
 * pose son propre jeton — `1`, `2`… `N` — qui isole les WORKERS ENTRE EUX mais PAS
 * les exécutions entre elles : deux agents qui parallélisent obtiendraient tous deux
 * `public_test_1`, soit exactement la panne que D-44 a soldée. Les deux jetons ne
 * répondent donc pas à la même question, et on les COMPOSE :
 *
 *     hors parallèle :  <pid+aléa>
 *     en parallèle   :  <pid+aléa>_<index worker>
 *
 * Le discriminant par exécution est en TÊTE : c'est lui qui survit, et c'est lui que
 * `FakeDiskIsolationTest` garde.
 */
final class TestProcessToken
{
    private static ?string $run = null;

    private static ?string $worker = null;

    private static bool $workerResolved = false;

    /** Le discriminant PAR EXÉCUTION — stable dans un processus, unique entre exécutions. */
    public static function runDiscriminant(): string
    {
        return self::$run ??= dechex(getmypid() ?: 0).bin2hex(random_bytes(3));
    }

    /**
     * Le jeton complet : discriminant d'exécution, plus l'index du worker quand
     * Laravel tourne en mode parallèle.
     *
     * `LARAVEL_PARALLEL_TESTING` et `TEST_TOKEN` sont posés par `artisan test
     * --parallel` dans l'ENVIRONNEMENT du processus fils : ils existent donc dès
     * son démarrage, avant `tests/bootstrap.php`. C'est ce qui rend la capture de
     * {@see self::workerIndex()} sûre au premier appel.
     */
    public static function value(): string
    {
        $worker = self::workerIndex();

        return $worker === null
            ? self::runDiscriminant()
            : self::runDiscriminant().'_'.$worker;
    }

    /**
     * L'index du worker que ParaTest a posé, ou `null` hors mode parallèle.
     *
     * ⚠ CAPTURÉ AU PREMIER APPEL, ET MÉMORISÉ. `TestFilesystemIsolation` écrit dans
     * `TEST_TOKEN` : sans mémorisation, un appel postérieur à cette écriture relirait
     * NOTRE valeur comme si elle venait de ParaTest, et la composerait une seconde
     * fois. La mémorisation supprime aussi toute dépendance à l'ordre des deux
     * `install()` de `tests/bootstrap.php` — ordre qu'il ne faut pas avoir à connaître
     * pour lire ce fichier.
     */
    private static function workerIndex(): ?string
    {
        if (! self::$workerResolved) {
            self::$workerResolved = true;

            if (isset($_SERVER['LARAVEL_PARALLEL_TESTING'], $_SERVER['TEST_TOKEN'])) {
                self::$worker = (string) $_SERVER['TEST_TOKEN'];
            }
        }

        return self::$worker;
    }
}
