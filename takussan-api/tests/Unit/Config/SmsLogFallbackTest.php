<?php

namespace Tests\Unit\Config;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse m6 — le pilote `log` écrit le texte du SMS, donc le code de
 * vérification, dans le journal. `SMS_LOG_FALLBACK` ne l'ajoute aux chaînes qu'en `local` ou en
 * `testing` : une variable recopiée par erreur en préproduction ou en production n'ouvre rien.
 *
 * Rouge sur 4edffa44 : la variable suffisait, quel que soit `APP_ENV` — seul un commentaire
 * disait « jamais en préproduction ni en production ».
 */
class SmsLogFallbackTest extends TestCase
{
    /** @var array<string, string|false> */
    private array $avant = [];

    protected function tearDown(): void
    {
        foreach ($this->avant as $nom => $valeur) {
            $this->poser($nom, $valeur === false ? null : $valeur);
        }
        parent::tearDown();
    }

    /** @return array<string, array{0: string, 1: bool}> */
    public static function environnements(): array
    {
        return [
            'local' => ['local', true],
            'testing' => ['testing', true],
            'staging' => ['staging', false],
            'preview' => ['preview', false],
            'production' => ['production', false],
        ];
    }

    #[DataProvider('environnements')]
    public function test_le_pilote_log_n_est_ajoute_qu_en_local_ou_en_test(string $env, bool $attendu): void
    {
        $this->remplacer('APP_ENV', $env);
        $this->remplacer('SMS_LOG_FALLBACK', 'true');

        $chaines = (require config_path('sms.php'))['fallback_chains'];

        foreach ($chaines as $operateur => $chaine) {
            $this->assertSame($attendu, in_array('log', $chaine, true), "{$env} / {$operateur}");
        }
    }

    public function test_sans_la_variable_aucune_chaine_n_a_le_pilote_log(): void
    {
        $this->remplacer('APP_ENV', 'local');
        $this->remplacer('SMS_LOG_FALLBACK', null);

        foreach ((require config_path('sms.php'))['fallback_chains'] as $chaine) {
            $this->assertNotContains('log', $chaine);
        }
    }

    private function remplacer(string $nom, ?string $valeur): void
    {
        if (! array_key_exists($nom, $this->avant)) {
            $this->avant[$nom] = getenv($nom);
        }
        $this->poser($nom, $valeur);
    }

    private function poser(string $nom, ?string $valeur): void
    {
        if ($valeur === null) {
            putenv($nom);
            unset($_ENV[$nom], $_SERVER[$nom]);

            return;
        }
        putenv("{$nom}={$valeur}");
        $_ENV[$nom] = $_SERVER[$nom] = $valeur;
    }
}
