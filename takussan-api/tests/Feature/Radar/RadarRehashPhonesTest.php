<?php

namespace Tests\Feature\Radar;

use App\Models\RadarAdvertiser;
use App\Support\RadarPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2414 (ADR-0077 §9) — `radar:rehash-phones`, après la pose ou la rotation de la clé de l'empreinte : réécrit sous la clé
 * courante l'empreinte de chaque annonceur dont le numéro est connu, et COMPTE ceux dont le numéro est purgé — leur
 * empreinte ne se recalcule pas, l'ancienne clé doit rester dans `RADAR_PHONE_HMAC_PREVIOUS_KEYS`.
 */
class RadarRehashPhonesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['radar.phone_hmac_key' => 'cle-une', 'radar.phone_hmac_previous_keys' => []]);
    }

    public function test_ac5_reecrit_les_empreintes_recalculables_et_compte_les_numeros_purges_sans_les_toucher(): void
    {
        $connu = RadarAdvertiser::factory()->create(['phone' => '+221771234567']);
        $refus = RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac('+221772223344')]);
        $ancienneEmpreinteDuRefus = $refus->phone_hmac;

        config(['radar.phone_hmac_key' => 'cle-deux', 'radar.phone_hmac_previous_keys' => ['cle-une']]);
        $deja = RadarAdvertiser::factory()->create(['phone' => '+221783334455']);

        $this->artisan('radar:rehash-phones')
            ->expectsOutputToContain('rewritten=1 current=1 conflicts=0 without_number=1 refusals_without_number=1')
            ->expectsOutputToContain('RADAR_PHONE_HMAC_PREVIOUS_KEYS')
            ->assertSuccessful();

        $this->assertSame(RadarPhone::hmac('+221771234567'), $connu->fresh()->phone_hmac);
        $this->assertSame(RadarPhone::hmac('+221783334455'), $deja->fresh()->phone_hmac);
        $this->assertSame($ancienneEmpreinteDuRefus, $refus->fresh()->phone_hmac, 'une empreinte sans numéro ne se recalcule pas');
    }

    public function test_a_blanc_rien_n_est_ecrit(): void
    {
        $connu = RadarAdvertiser::factory()->create(['phone' => '+221771234567']);
        $avant = $connu->phone_hmac;
        config(['radar.phone_hmac_key' => 'cle-deux']);

        $this->artisan('radar:rehash-phones', ['--dry-run' => true])
            ->expectsOutputToContain('rewritten=1')
            ->assertSuccessful();

        $this->assertSame($avant, $connu->fresh()->phone_hmac);
    }

    public function test_une_empreinte_deja_prise_par_une_autre_ligne_est_comptee_en_conflit_sans_casser(): void
    {
        // Deux lignes pour un même numéro : l'une purgée sous la clé neuve, l'autre en clair sous l'ancienne.
        $enClair = RadarAdvertiser::factory()->create(['phone' => '+221771234567']);
        config(['radar.phone_hmac_key' => 'cle-deux']);
        $purgee = RadarAdvertiser::factory()->create(['phone' => null, 'phone_hmac' => RadarPhone::hmac('+221771234567')]);
        $avant = $enClair->phone_hmac;

        $this->artisan('radar:rehash-phones')
            ->expectsOutputToContain('rewritten=0 current=0 conflicts=1')
            ->assertSuccessful();

        $this->assertSame($avant, $enClair->fresh()->phone_hmac);
        $this->assertSame(RadarPhone::hmac('+221771234567'), $purgee->fresh()->phone_hmac);
    }

    public function test_sans_cle_dediee_la_commande_le_dit(): void
    {
        config(['radar.phone_hmac_key' => null]);

        $this->artisan('radar:rehash-phones')
            ->expectsOutputToContain('RADAR_PHONE_HMAC_KEY')
            ->assertSuccessful();
    }

    public function test_un_refus_masque_par_une_ligne_vivante_sous_la_cle_courante_est_compte_en_conflit(): void
    {
        // Banc B3 : refus purgé sous l'ancienne clé, ligne vivante du même numéro née sous la courante pendant l'oubli.
        RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac('+221771234567')]);
        config(['radar.phone_hmac_key' => 'cle-deux']);
        $vivant = RadarAdvertiser::factory()->create(['phone' => '+221771234567']);
        config(['radar.phone_hmac_previous_keys' => ['cle-une']]);

        $this->artisan('radar:rehash-phones')
            ->expectsOutputToContain('rewritten=0 current=0 conflicts=1')
            ->assertSuccessful();

        $this->assertNull($vivant->fresh()->do_not_contact_at, 'la commande compte, elle ne fusionne pas');
    }
}
