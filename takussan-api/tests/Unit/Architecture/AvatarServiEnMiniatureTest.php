<?php

namespace Tests\Unit\Architecture;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * TCK-762 (P10.05) — l'avatar sort par `User::avatarUrl()`, la miniature, jamais par l'URL de
 * l'original (`getFirstMediaUrl('avatar')`, `mediaUrl('avatar')`). Huit endroits rendaient
 * l'original avant ce ticket : un seul oubli republie le fichier déposé.
 */
class AvatarServiEnMiniatureTest extends TestCase
{
    public function test_aucun_code_ne_rend_l_url_de_l_avatar_original(): void
    {
        $racine = dirname(__DIR__, 3).'/app';
        $fautes = [];

        $fichiers = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($fichiers as $fichier) {
            if ($fichier->getExtension() !== 'php') {
                continue;
            }
            $source = (string) file_get_contents($fichier->getPathname());
            if (preg_match('/(?:getFirstMediaUrl|mediaUrl)\(\s*[\'"]avatars?[\'"]\s*\)/', $source) === 1) {
                $fautes[] = substr($fichier->getPathname(), strlen($racine) + 1);
            }
        }

        $this->assertSame([], $fautes, "L'URL de l'avatar original est rendue ; passer par User::avatarUrl().");
    }
}
