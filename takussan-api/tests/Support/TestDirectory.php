<?php

namespace Tests\Support;

use FilesystemIterator;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use Throwable;

/**
 * La suppression récursive d'un répertoire de travail du harnais.
 *
 * Extraite parce que TROIS mécanismes d'isolation la refont désormais — les
 * disques `Storage::fake()` ({@see TestFilesystemIsolation}), les vues compilées
 * ({@see TestCompiledViews}) et leurs purges d'orphelins respectives. Elle
 * n'existe PAS pour éviter quinze lignes recopiées : elle existe pour que la
 * règle qui compte n'ait qu'un seul exemplaire — **un nettoyage ne doit JAMAIS
 * faire échouer une exécution.** Une variante qui laisserait remonter une
 * exception ferait rougir un test sur un répertoire que quelqu'un d'autre vient
 * de retirer, c'est-à-dire exactement le genre de rouge non reproductible que
 * D-44 a coûté six semaines à comprendre.
 */
final class TestDirectory
{
    public static function removeRecursively(string $path): void
    {
        try {
            $items = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST,
            );

            foreach ($items as $item) {
                $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
            }

            @rmdir($path);
        } catch (Throwable) {
            // Le nettoyage ne doit jamais faire échouer une exécution.
        }
    }
}
