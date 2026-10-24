<?php

namespace Tests\Feature\Admin\Platform;

use App\Services\Admin\HealthcheckService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * TCK-2129 (P219.01) — chaque sonde que l'API émet a sa tuile sur la page de santé de la console.
 *
 * Le `status` global est le pire de TOUTES les sondes : une sonde sans tuile en `failed` faisait
 * dire « En panne » à la page sans qu'aucune tuile ne le montre (`scheduler`, `whatsapp`,
 * `proxies`, `lemon_squeezy_webhook`). La liste `CHECKS` est lue dans le fichier du front, comme
 * `BookingQuoteConcordanceTest` lit sa fixture partagée : une sonde ajoutée d'un seul côté rougit.
 */
class HealthcheckTuilesConcordanceTest extends TestCase
{
    use RefreshDatabase;

    private const FRONT = __DIR__.'/../../../../../takussan-web/src/components/admin/super/system-health.tsx';

    public function test_chaque_sonde_de_l_api_a_sa_tuile_et_reciproquement(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        config(['media-library.public_disk_name' => 'public', 'media-library.disk_name' => 'local']);

        $sondes = array_keys(app(HealthcheckService::class)->snapshot());
        $sondes = array_values(array_diff($sondes, ['status', 'generated_at']));

        $this->assertSame($this->trier($sondes), $this->trier($this->tuiles()));
    }

    /** @return list<string> */
    private function tuiles(): array
    {
        $source = (string) file_get_contents(self::FRONT);
        $this->assertSame(1, preg_match('/const CHECKS\b[^=]*=\s*\[(.*?)\n\];/s', $source, $bloc), 'CHECKS introuvable dans system-health.tsx');
        preg_match_all("/key:\s*'([a-z_]+)'/", $bloc[1], $cles);
        $this->assertNotEmpty($cles[1], 'CHECKS ne porte aucune clé');

        return $cles[1];
    }

    /**
     * @param  list<string>  $liste
     * @return list<string>
     */
    private function trier(array $liste): array
    {
        sort($liste);

        return $liste;
    }
}
