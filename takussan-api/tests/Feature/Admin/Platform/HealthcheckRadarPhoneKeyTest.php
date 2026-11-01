<?php

namespace Tests\Feature\Admin\Platform;

use App\Services\Admin\HealthcheckService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * TCK-2414 (ADR-0077 §9) — la sonde `radar_phone_key` réclame la clé dédiée de l'empreinte des refus hors `local` et
 * `testing` : sans elle, une rotation d'`APP_KEY` rendrait méconnaissables les numéros qui ont dit STOP. `degraded`, pas
 * `failed` : rien ne casse tant qu'`APP_KEY` ne tourne pas, et la route publique reste en 200.
 */
class HealthcheckRadarPhoneKeyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Storage::fake('public');
        config(['media-library.public_disk_name' => 'public', 'media-library.disk_name' => 'local']);
    }

    /** @return array<string, mixed> */
    private function sonde(string $environnement, ?string $cle): array
    {
        $this->app['env'] = $environnement;
        config(['radar.phone_hmac_key' => $cle]);

        return app(HealthcheckService::class)->refresh()['radar_phone_key'];
    }

    public function test_ac4_hors_local_la_cle_absente_degrade_la_sonde(): void
    {
        foreach (['production', 'staging', 'preview'] as $environnement) {
            foreach ([null, ''] as $vide) {
                $sonde = $this->sonde($environnement, $vide);

                $this->assertSame('degraded', $sonde['status'], $environnement);
                $this->assertSame('radar_phone_key_missing', $sonde['reason'], $environnement);
            }
        }
    }

    public function test_la_cle_posee_rend_la_sonde_ok_sans_jamais_l_exposer(): void
    {
        $sonde = $this->sonde('production', 'cle-dediee-radar');

        $this->assertSame('ok', $sonde['status']);
        $this->assertArrayNotHasKey('reason', $sonde);
        $this->assertStringNotContainsString('cle-dediee-radar', (string) json_encode($sonde));
    }

    public function test_en_local_et_en_test_la_sonde_se_tait(): void
    {
        foreach (['local', 'testing'] as $environnement) {
            $this->assertSame('ok', $this->sonde($environnement, null)['status'], $environnement);
        }
    }
}
