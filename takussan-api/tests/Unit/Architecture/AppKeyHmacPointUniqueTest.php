<?php

namespace Tests\Unit\Architecture;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * TCK-2430 (ADR-0084) — une empreinte HMAC sous `APP_KEY` se calcule par `App\Support\AppKeyHmac`, et nulle part
 * ailleurs : un `hash_hmac(…, config('app.key'))` écrit à la main ne se relit pas sous `APP_PREVIOUS_KEYS`, et une
 * rotation d'`APP_KEY` rouvrait des désinscriptions et des crédits de bienvenue. Les exceptions sont celles du Radar
 * (ADR-0082), qui lisent déjà sous les anciennes clés, et `config/app.php`, qui déclare la clé.
 *
 * Balayés : `app/`, `config/`, `database/`, `routes/`, `bootstrap/` (sauf `bootstrap/cache`). La garde lit les jetons
 * PHP (`token_get_all`), jamais les commentaires, et refuse :
 * - les chaînes `'app.key'`, `'app.previous_keys'`, `'APP_KEY'`, `'APP_PREVIOUS_KEYS'` (donc `config()`, `env()`,
 *   `Config::get()`, quels que soient les guillemets) ;
 * - `config('app')`, d'où l'on lirait `['key']` ;
 * - `Crypt::getKey()`, et `->getKey()` appelé juste après `app('encrypter')` ;
 * - `getPreviousKeys` et `getAllKeys`, en tout lieu.
 *
 * **Hors d'atteinte, c'est un plancher** : une clé assemblée par concaténation (`config('app.'.$k)`, `config($p.'key')`),
 * et `->getKey()` sur un chiffreur reçu par injection (`Encrypter $e` puis `$e->getKey()`) — le nom est aussi celui de la
 * clé primaire d'Eloquent, partout dans le code. La relecture les attrape, pas cette garde.
 *
 * Elle se garde elle-même : un balayage qui ne trouve plus `AppKeyHmac` ni `config/app.php` rougit.
 */
class AppKeyHmacPointUniqueTest extends TestCase
{
    private const DOSSIERS = ['app', 'config', 'database', 'routes', 'bootstrap'];

    /** Les seuls fichiers qui lisent la clé de l'application ou ses anciennes clés. */
    private const PERMIS = [
        'app/Support/AppKeyHmac.php',
        'app/Support/RadarPhone.php',
        'app/Services/Radar/ClaimLinks.php',
        'config/app.php',
    ];

    private const CHAINES_INTERDITES = ['app.key', 'app.previous_keys', 'APP_KEY', 'APP_PREVIOUS_KEYS'];

    private const METHODES_INTERDITES = ['getpreviouskeys', 'getallkeys'];

    public function test_aucun_fichier_hors_du_point_unique_ne_lit_la_cle_de_l_application(): void
    {
        $racine = dirname(__DIR__, 3).'/';
        $fautes = [];
        $vus = [];
        foreach (self::DOSSIERS as $dossier) {
            foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine.$dossier)) as $fichier) {
                $relatif = substr($fichier->getPathname(), strlen($racine));
                if (! $fichier->isFile() || $fichier->getExtension() !== 'php' || str_starts_with($relatif, 'bootstrap/cache/')) {
                    continue;
                }
                $vus[] = $relatif;
                if (! in_array($relatif, self::PERMIS, true) && $this->litLaCle((string) file_get_contents($fichier->getPathname()))) {
                    $fautes[] = $relatif;
                }
            }
        }

        $this->assertContains('app/Support/AppKeyHmac.php', $vus, 'Le balayage ne trouve plus AppKeyHmac : cette garde ne garde plus rien.');
        $this->assertContains('config/app.php', $vus, 'Le balayage ne lit plus config/ : cette garde ne garde plus rien.');
        $this->assertSame([], $fautes, 'Une empreinte sous APP_KEY se calcule par App\Support\AppKeyHmac (ADR-0084).');
    }

    /** Un témoin par forme refusée : chacun doit être vu. */
    public function test_la_garde_voit_chaque_forme_refusee(): void
    {
        $temoins = [
            "hash_hmac('sha256', \$x, (string) config('app.key'));",
            '$k = config("app.previous_keys");',
            "\$k = env('APP_KEY');",
            '$k = env("APP_PREVIOUS_KEYS", "");',
            "\$k = Config::get('app.key');",
            "\$k = config('app')['key'];",
            "\$k = config( 'app' )['previous_keys'];",
            '$k = Crypt::getKey();',
            '$k = \\Illuminate\\Support\\Facades\\Crypt::getKey();',
            "\$k = app('encrypter')->getKey();",
            "\$k = app('encrypter')->getPreviousKeys();",
            '$k = $chiffreur->getAllKeys();',
        ];

        foreach ($temoins as $temoin) {
            $this->assertTrue($this->litLaCle("<?php\n{$temoin}\n"), "La garde ne voit pas : {$temoin}");
        }
    }

    /** Ce qui n'est pas une lecture de la clé : un commentaire, une autre clé de config, la clé primaire d'un modèle. */
    public function test_la_garde_laisse_passer_ce_qui_n_est_pas_la_cle(): void
    {
        $sains = [
            "// HMAC sous `app.key`, voir config('app.key') et env('APP_KEY')\n/** 'app.key' */",
            "\$a = 'app.keyring';",
            "\$n = config('app.name');",
            '$id = $model->getKey();',
            "\$e = app('encrypter');\n\$v = \$e->decryptString(\$x);",
            "\$k = env('REVERB_APP_KEY');",
        ];

        foreach ($sains as $sain) {
            $this->assertFalse($this->litLaCle("<?php\n{$sain}\n"), "La garde refuse à tort : {$sain}");
        }
    }

    private function litLaCle(string $source): bool
    {
        $jetons = array_values(array_filter(
            token_get_all($source),
            fn (mixed $jeton): bool => ! is_array($jeton) || ! in_array($jeton[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true),
        ));
        $texte = fn (int $i): string => isset($jetons[$i]) ? (is_array($jetons[$i]) ? $jetons[$i][1] : $jetons[$i]) : '';
        $chaine = fn (int $i): ?string => isset($jetons[$i]) && is_array($jetons[$i]) && $jetons[$i][0] === T_CONSTANT_ENCAPSED_STRING
            ? substr($jetons[$i][1], 1, -1) : null;

        foreach (array_keys($jetons) as $i) {
            $mot = strtolower($texte($i));
            if (in_array($chaine($i), self::CHAINES_INTERDITES, true)
                || in_array($mot, self::METHODES_INTERDITES, true)
                // config('app')
                || ($mot === 'config' && $texte($i + 1) === '(' && $chaine($i + 2) === 'app' && $texte($i + 3) === ')')
                // Crypt::getKey(), \…\Crypt::getKey()
                || ($mot === 'getkey' && $texte($i - 1) === '::' && preg_match('/(^|\\\\)crypt$/i', $texte($i - 2)) === 1)
                // app('encrypter')->getKey()
                || ($mot === 'getkey' && $texte($i - 1) === '->' && $texte($i - 2) === ')' && $chaine($i - 3) === 'encrypter')) {
                return true;
            }
        }

        return false;
    }
}
