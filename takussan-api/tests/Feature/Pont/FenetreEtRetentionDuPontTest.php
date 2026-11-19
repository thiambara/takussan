<?php

namespace Tests\Feature\Pont;

use App\Models\MessageRelay;
use App\Services\Notifications\Whatsapp\ServiceWindow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Support\SceneDuPont;

/**
 * TCK-2980 (ADR-0132 § 1, § 4) — la fenêtre de 24 h par numéro ET numéro d'entreprise (le relais entrant le plus
 * récent), et l'effacement des numéros des relais après 90 jours.
 */
class FenetreEtRetentionDuPontTest extends ApiTestCase
{
    use RefreshDatabase, SceneDuPont;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLePont();
    }

    public function test_la_fenetre_se_lit_par_numero_d_entreprise(): void
    {
        $fenetre = app(ServiceWindow::class);
        $this->assertFalse($fenetre->isOpenFor(self::TEL_INCONNU, self::NUMERO_A));

        $this->recevoir([$this->texte('wamid.F1', self::TEL_INCONNU, 'Bonjour')])->assertOk();

        $this->assertTrue($fenetre->isOpenFor(self::TEL_INCONNU, self::NUMERO_A));
        $this->assertFalse($fenetre->isOpenFor(self::TEL_INCONNU, 'PNID-AUTRE'));
        // Sans numéro d'entreprise : `last_inbound_at`, que le pont pose aussi.
        $this->assertTrue($fenetre->isOpenFor(self::TEL_INCONNU, null));

        $this->travel(25)->hours();
        $this->assertFalse($fenetre->isOpenFor(self::TEL_INCONNU, self::NUMERO_A));
    }

    public function test_les_numeros_des_relais_s_effacent_apres_90_jours(): void
    {
        $ancien = $this->relaisSortant($this->fil, $this->bailleur, 'wamid.V1');
        $ancien->forceFill(['sent_at' => now()->subDays(91)])->save();
        $recent = $this->relaisSortant($this->fil, $this->bailleur, 'wamid.V2');

        $this->artisan('pont:effacer-numeros')->assertSuccessful();

        $this->assertNull($ancien->fresh()->phone);
        $this->assertSame(self::TEL_BAILLEUR, $recent->fresh()->phone);
        $this->assertSame(2, MessageRelay::query()->count());
    }
}
