<?php

namespace Tests\Feature\Security;

use App\Console\Commands\SecurityRehashFingerprints;
use App\Models\AlertSubscriber;
use App\Models\SavedSearch;
use App\Models\User;
use App\Support\PhoneFingerprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Support\RotationDAppKey;
use Tests\TestCase;

/**
 * TCK-614 (ADR-0084, amendement du 2026-11-16) — la pose d'`APP_HMAC_KEY`, `security:rehash-fingerprints`, une
 * rotation d'`APP_KEY`, `security:reencrypt`, puis le RETRAIT de l'ancienne clé : un abonné aux alertes écrit avant
 * tout cela se retrouve encore (AC2). Et la réécriture ne blanchit rien : un octroi de bienvenue dont la source a
 * changé n'est pas réécrit, il est compté.
 */
class HmacKeyRotationTest extends TestCase
{
    use RefreshDatabase;
    use RotationDAppKey;

    private const EMAIL = 'awa@exemple.sn';

    private string $jeton = '';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config(['app.hmac_key' => null]); // le parc d'avant TCK-614 : tout est écrit sous APP_KEY
    }

    private function abonne(bool $confirme = true): AlertSubscriber
    {
        $abonne = AlertSubscriber::create([
            'channel' => AlertSubscriber::CHANNEL_EMAIL,
            'contact' => self::EMAIL,
            'contact_hash' => AlertSubscriber::contactHash(AlertSubscriber::CHANNEL_EMAIL, self::EMAIL),
            'locale' => 'fr',
            'confirmed_at' => $confirme ? now() : null,
            'unsubscribe_token' => $jeton = $this->jeton = AlertSubscriber::newToken(),
            'unsubscribe_token_hash' => AlertSubscriber::tokenHash($jeton),
            'consent_at' => now(),
            'consent_source' => 'public_search_alert',
            'consent_version' => AlertSubscriber::CONSENT_VERSION,
        ]);
        SavedSearch::create(['alert_subscriber_id' => $abonne->id, 'name' => 'Dakar '.$abonne->id, 'criteria' => ['city' => 'Dakar']]);

        return $abonne;
    }

    /** La procédure de l'amendement, de bout en bout. `$recalculer = false` est l'ablation du recalcul. */
    private function poserLaCleTournerEtRetirer(bool $recalculer = true): void
    {
        config(['app.hmac_key' => 'cle-d-empreinte-de-test']);
        if ($recalculer) {
            $this->artisan('security:rehash-fingerprints')->assertExitCode(0);
        }
        $this->tournerAppKey();
        $this->artisan('security:reencrypt')->assertExitCode(0);
        config(['app.previous_keys' => []]);
        $this->app->forgetInstance('encrypter');
        Crypt::clearResolvedInstance('encrypter');
    }

    public function test_ac2_apres_retrait_de_l_ancienne_cle_la_desinscription_retrouve_les_demandes_d_avant(): void
    {
        $avant = $this->abonne();
        $this->poserLaCleTournerEtRetirer();
        $apres = $this->abonne();

        $this->assertSame(2, AlertSubscriber::query()->forContact(AlertSubscriber::CHANNEL_EMAIL, self::EMAIL)->count(), 'la recherche par contact les voit toutes deux');

        $this->postJson('/api/public/search-alerts/unsubscribe', ['token' => $apres->fresh()->unsubscribe_token])
            ->assertOk()->assertJsonPath('data.status', 'unsubscribed');

        $this->assertModelMissing($avant);
        $this->assertSame(0, AlertSubscriber::query()->count());
    }

    public function test_ac2_le_plafond_par_boite_compte_encore_les_demandes_d_avant(): void
    {
        foreach (range(1, 5) as $i) {
            $this->abonne(confirme: false);
        }
        $this->poserLaCleTournerEtRetirer();

        $this->postJson('/api/public/search-alerts', [
            'criteria' => ['city' => 'Dakar'], 'name' => 'Sixième', 'frequency' => 'daily', 'channel' => 'email',
            'email' => self::EMAIL, 'locale' => 'fr', 'consent' => true,
        ])->assertStatus(202);

        $this->assertSame(5, AlertSubscriber::query()->count());
    }

    /** Le témoin de l'ablation : sans recalcul, le retrait de l'ancienne clé perd les demandes d'avant. */
    public function test_sans_recalcul_le_retrait_perd_les_demandes_d_avant(): void
    {
        $this->abonne();
        $this->poserLaCleTournerEtRetirer(recalculer: false);

        $this->assertSame(0, AlertSubscriber::query()->forContact(AlertSubscriber::CHANNEL_EMAIL, self::EMAIL)->count());
    }

    public function test_la_bienvenue_se_reecrit_si_le_numero_est_le_meme_et_se_compte_sinon(): void
    {
        $garde = User::factory()->create(['phone' => '+221771234567']);
        $change = User::factory()->create(['phone' => '+221771234568']);
        $anonyme = User::factory()->create(['phone' => '+221771234569']);
        $ligne = fn (User $u, string $hash): int => DB::table('credit_welcome_grants')->insertGetId([
            'phone_hash' => $hash, 'user_id' => $u->id, 'granted_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $idGarde = $ligne($garde, PhoneFingerprint::of('+221771234567'));
        $idChange = $ligne($change, $ancienneChange = PhoneFingerprint::of('+221771234568'));
        $idAnonyme = $ligne($anonyme, $ancienneAnonyme = PhoneFingerprint::of('+221771234569'));
        $change->forceFill(['phone' => '+221779999999'])->save();
        $anonyme->forceFill(['phone' => null])->save();
        config(['app.hmac_key' => 'cle-d-empreinte-de-test']);

        $this->artisan('security:rehash-fingerprints', ['--dry-run' => true])
            ->expectsOutputToContain("bienvenue — reecrites=1 courantes=0 sans_source=2 conflits=0 ; sans source : #{$idChange}, #{$idAnonyme}")
            ->assertExitCode(0);
        $this->assertSame(PhoneFingerprint::all('+221771234567')[1], DB::table('credit_welcome_grants')->where('id', $idGarde)->value('phone_hash'), 'à blanc : rien d\'écrit');

        $this->artisan('security:rehash-fingerprints')->assertExitCode(0);
        $this->assertSame(PhoneFingerprint::of('+221771234567'), DB::table('credit_welcome_grants')->where('id', $idGarde)->value('phone_hash'));
        $this->assertSame($ancienneChange, DB::table('credit_welcome_grants')->where('id', $idChange)->value('phone_hash'), 'un numéro changé ne réécrit pas l\'octroi sous le neuf');
        $this->assertSame($ancienneAnonyme, DB::table('credit_welcome_grants')->where('id', $idAnonyme)->value('phone_hash'));

        $this->artisan('security:rehash-fingerprints')
            ->expectsOutputToContain('bienvenue — reecrites=0 courantes=1 sans_source=2')
            ->assertExitCode(0);
    }

    public function test_un_contact_illisible_est_compte_jamais_efface(): void
    {
        $abonne = $this->abonne();
        DB::table('alert_subscribers')->where('id', $abonne->id)->update(['contact' => 'abîmé']);
        config(['app.hmac_key' => 'cle-d-empreinte-de-test']);

        $this->artisan('security:rehash-fingerprints')
            ->expectsOutputToContain("alertes — reecrites=0 courantes=0 sans_source=1 ; sans source : #{$abonne->id}")
            ->assertExitCode(0);
        $this->assertModelExists($abonne);
    }

    public function test_hors_local_et_testing_sans_cle_le_deploiement_est_refuse(): void
    {
        $this->app['env'] = 'staging';

        $this->artisan('security:rehash-fingerprints')
            ->expectsOutputToContain('APP_HMAC_KEY est vide')
            ->assertExitCode(SecurityRehashFingerprints::CLE_ABSENTE);
    }
}
