<?php

namespace Tests\Unit\Architecture;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * TCK-2430 (ADR-0084) — une empreinte HMAC sous `APP_KEY` se calcule par `App\Support\AppKeyHmac`, et nulle part
 * ailleurs : un `hash_hmac(…, config('app.key'))` écrit à la main ne se relit pas sous `APP_PREVIOUS_KEYS`, et une
 * rotation d'`APP_KEY` rouvrait des désinscriptions et des crédits de bienvenue. Les deux exceptions sont celles du
 * Radar (ADR-0082), qui lisent déjà sous les anciennes clés.
 *
 * La garde lit les chaînes du code (`token_get_all`), pas les commentaires. Elle se garde elle-même : un balayage qui
 * ne trouve plus `AppKeyHmac` rougit.
 */
class AppKeyHmacPointUniqueTest extends TestCase
{
    /** Les seuls fichiers qui nomment la clé de l'application ou ses anciennes clés. */
    private const PERMIS = [
        'Support/AppKeyHmac.php',
        'Support/RadarPhone.php',
        'Services/Radar/ClaimLinks.php',
    ];

    public function test_aucun_fichier_hors_du_point_unique_ne_lit_la_cle_de_l_application(): void
    {
        $racine = dirname(__DIR__, 3).'/app/';
        $fautes = [];
        $vus = [];
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine)) as $fichier) {
            if (! $fichier->isFile() || $fichier->getExtension() !== 'php') {
                continue;
            }
            $relatif = substr($fichier->getPathname(), strlen($racine));
            $vus[] = $relatif;
            if (! in_array($relatif, self::PERMIS, true) && $this->litLaCle((string) file_get_contents($fichier->getPathname()))) {
                $fautes[] = $relatif;
            }
        }

        $this->assertContains('Support/AppKeyHmac.php', $vus, 'Le balayage ne trouve plus AppKeyHmac : cette garde ne garde plus rien.');
        $this->assertSame([], $fautes, 'Une empreinte sous APP_KEY se calcule par App\Support\AppKeyHmac (ADR-0084).');
    }

    public function test_la_garde_voit_une_lecture_et_pas_un_commentaire(): void
    {
        $this->assertTrue($this->litLaCle("<?php\n\$h = hash_hmac('sha256', \$x, (string) config('app.key'));\n"));
        $this->assertTrue($this->litLaCle("<?php\n\$k = config(\"app.previous_keys\");\n"));
        $this->assertFalse($this->litLaCle("<?php\n// HMAC sous `app.key`, voir config('app.key')\n/** 'app.key' */\n\$a = 'app.keyring';\n"));
    }

    private function litLaCle(string $source): bool
    {
        foreach (token_get_all($source) as $jeton) {
            if (is_array($jeton) && $jeton[0] === T_CONSTANT_ENCAPSED_STRING && in_array(trim($jeton[1], '\'"'), ['app.key', 'app.previous_keys'], true)) {
                return true;
            }
        }

        return false;
    }
}
