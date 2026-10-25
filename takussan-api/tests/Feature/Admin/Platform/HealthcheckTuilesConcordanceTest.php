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
 * `proxies`, `lemon_squeezy_webhook`).
 *
 * Comme `BookingQuoteConcordanceTest`, les deux suites lisent une fixture partagée,
 * `tests/fixtures/healthcheck-sondes.json` : ce test la compare aux sondes émises, et
 * `system-health.concordance.test.ts` (front) à la liste `CHECKS` de `system-health.tsx`. Une
 * sonde ajoutée d'un seul côté rougit l'un des deux. Ce test ne lit pas le front lui-même :
 * `check-ci-attestation` refuse qu'un test de l'API lise un fichier hors de la clé de l'API.
 */
class HealthcheckTuilesConcordanceTest extends TestCase
{
    use RefreshDatabase;

    private const FIXTURE = __DIR__.'/../../../fixtures/healthcheck-sondes.json';

    public function test_chaque_sonde_de_l_api_a_sa_tuile_et_reciproquement(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        config(['media-library.public_disk_name' => 'public', 'media-library.disk_name' => 'local']);

        $sondes = array_keys(app(HealthcheckService::class)->snapshot());
        $sondes = array_values(array_diff($sondes, ['status', 'generated_at']));

        $this->assertSame($this->trier($sondes), $this->trier($this->tuiles()));
    }

    public function test_la_fixture_porte_les_sondes(): void
    {
        $this->assertGreaterThanOrEqual(14, count($this->tuiles()));
    }

    /** @return list<string> */
    private function tuiles(): array
    {
        $json = json_decode((string) file_get_contents(self::FIXTURE), true, flags: JSON_THROW_ON_ERROR);

        return $json['sondes'];
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
