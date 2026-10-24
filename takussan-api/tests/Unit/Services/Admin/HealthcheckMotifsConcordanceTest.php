<?php

namespace Tests\Unit\Services\Admin;

use PHPUnit\Framework\TestCase;

/**
 * TCK-2131 (P219.02) — chaque motif qu'une sonde émet par code (`'reason' => '…'` de
 * `HealthcheckService`) figure dans l'union `HealthReason` du front, et réciproquement.
 *
 * `proxies` et `lemon_squeezy_webhook` émettaient `wildcard_trusts_nobody` et
 * `signing_secret_missing`, que l'union ignorait : leur tuile peignait la clé brute. Les deux
 * fichiers sont lus comme `BookingQuoteConcordanceTest` lit sa fixture partagée.
 */
class HealthcheckMotifsConcordanceTest extends TestCase
{
    private const API = __DIR__.'/../../../../app/Services/Admin/HealthcheckService.php';

    private const FRONT = __DIR__.'/../../../../../takussan-web/src/types/super-admin.ts';

    public function test_chaque_motif_emis_est_dans_l_union_du_front_et_reciproquement(): void
    {
        preg_match_all("/'reason'\s*=>\s*'([a-z_]+)'/", (string) file_get_contents(self::API), $emis);
        $emis = array_values(array_unique($emis[1]));
        $this->assertNotEmpty($emis, 'HealthcheckService n\'émet aucun motif : le motif de relevé a dérivé');

        $source = (string) file_get_contents(self::FRONT);
        $this->assertSame(1, preg_match('/export type HealthReason\s*=([^;]*);/', $source, $union), 'HealthReason introuvable dans super-admin.ts');
        preg_match_all("/'([a-z_]+)'/", $union[1], $front);

        sort($emis);
        $front = $front[1];
        sort($front);

        $this->assertSame($emis, $front);
    }
}
