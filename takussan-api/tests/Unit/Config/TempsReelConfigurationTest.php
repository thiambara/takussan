<?php

namespace Tests\Unit\Config;

use Illuminate\Broadcasting\BroadcastManager;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2956 (ADR-0129 § 5) — la configuration du temps réel en préproduction et en production.
 *
 * 1. Le serveur Reverb n'accepte de connexion que de l'hôte de FRONTEND_URL, hors `local`. Reverb compare
 *    l'HÔTE de l'en-tête Origin (`Pusher\Server::verifyOrigin`) : la liste porte des hôtes, pas des URL. La
 *    préproduction tourne en `staging` : une règle « production seulement » la laisserait ouverte.
 * 2. Une clé `REVERB_APP_*` ABSENTE de l'environnement ne fait pas tomber l'API quand le pilote est `reverb` :
 *    `routes/channels.php` construit le diffuseur au démarrage, et le client Pusher type ses identifiants en
 *    `string` (mesuré : `TypeError` à chaque commande, `migrate` du release compris).
 */
class TempsReelConfigurationTest extends TestCase
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

    /** @return array<string, array{0: string, 1: string, 2: list<string>}> */
    public static function environnements(): array
    {
        return [
            'production' => ['production', 'https://www.takussan.com', ['www.takussan.com']],
            'préproduction (staging)' => ['staging', 'https://preview.takussan.com', ['preview.takussan.com']],
            'pile de fumée' => ['production', 'http://localhost:3000', ['localhost']],
            'testing' => ['testing', 'http://localhost:3000', ['localhost']],
            'local : tout' => ['local', 'http://localhost:3000', ['*']],
            'FRONTEND_URL sans hôte : rien' => ['production', 'pas-une-url', []],
            'FRONTEND_URL vide : rien' => ['staging', '', []],
        ];
    }

    /** @param  list<string>  $attendues */
    #[DataProvider('environnements')]
    public function test_seul_l_hote_du_front_de_l_environnement_est_admis(string $env, string $front, array $attendues): void
    {
        $this->remplacer('APP_ENV', $env);
        $this->remplacer('FRONTEND_URL', $front);

        $application = (require config_path('reverb.php'))['apps']['apps'][0];

        $this->assertSame($attendues, $application['allowed_origins']);
    }

    public function test_hors_local_jamais_l_etoile(): void
    {
        foreach (['production', 'staging', 'preview', 'testing'] as $env) {
            $this->remplacer('APP_ENV', $env);
            $this->remplacer('FRONTEND_URL', 'https://preview.takussan.com');

            $origines = (require config_path('reverb.php'))['apps']['apps'][0]['allowed_origins'];

            $this->assertNotContains('*', $origines, $env);
        }
    }

    public function test_des_cles_reverb_absentes_ne_font_pas_tomber_le_diffuseur(): void
    {
        foreach (['REVERB_APP_KEY', 'REVERB_APP_SECRET', 'REVERB_APP_ID'] as $cle) {
            $this->remplacer($cle, null);
        }

        $connexion = (require config_path('broadcasting.php'))['connections']['reverb'];

        $this->assertSame('', $connexion['key']);
        $this->assertSame('', $connexion['secret']);
        $this->assertSame('', $connexion['app_id']);

        config(['broadcasting.connections.reverb' => $connexion]);
        $gestionnaire = $this->app->make(BroadcastManager::class);
        $gestionnaire->purge('reverb');

        // Le client Pusher type `string` : `null` lèverait ici « Failed to create broadcaster ».
        $this->assertNotNull($gestionnaire->connection('reverb'));
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
