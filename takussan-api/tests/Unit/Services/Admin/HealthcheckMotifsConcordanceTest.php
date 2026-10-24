<?php

namespace Tests\Unit\Services\Admin;

use PHPUnit\Framework\TestCase;

/**
 * TCK-2131 (P219.02) — chaque motif qu'une sonde émet par code (`'reason' => '…'` de
 * `HealthcheckService`) figure dans l'union `HealthReason` du front, et réciproquement.
 *
 * `proxies` et `lemon_squeezy_webhook` émettaient `wildcard_trusts_nobody` et
 * `signing_secret_missing`, que l'union ignorait : leur tuile peignait la clé brute.
 *
 * Comme `BookingQuoteConcordanceTest`, les deux suites lisent une fixture partagée,
 * `tests/fixtures/healthcheck-sondes.json` : ce test la compare aux motifs émis, et
 * `system-health.concordance.test.ts` (front) à l'union `HealthReason` de `super-admin.ts`. Ce
 * test ne lit pas le front lui-même : `check-ci-attestation` refuse qu'un test de l'API lise un
 * fichier hors de la clé de l'API.
 */
class HealthcheckMotifsConcordanceTest extends TestCase
{
    private const API = __DIR__.'/../../../../app/Services/Admin/HealthcheckService.php';

    private const FIXTURE = __DIR__.'/../../../fixtures/healthcheck-sondes.json';

    public function test_chaque_motif_emis_est_dans_la_fixture_et_reciproquement(): void
    {
        preg_match_all("/'reason'\s*=>\s*'([a-z_]+)'/", (string) file_get_contents(self::API), $emis);
        $emis = array_values(array_unique($emis[1]));
        $this->assertNotEmpty($emis, 'HealthcheckService n\'émet aucun motif : le motif de relevé a dérivé');

        $fixture = json_decode((string) file_get_contents(self::FIXTURE), true, flags: JSON_THROW_ON_ERROR)['motifs'];

        sort($emis);
        sort($fixture);

        $this->assertSame($emis, $fixture);
    }
}
