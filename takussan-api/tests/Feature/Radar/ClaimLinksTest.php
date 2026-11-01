<?php

namespace Tests\Feature\Radar;

use App\Exceptions\ApiError;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Radar\ClaimLinks;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2390 (ADR-0077 §3) — le lien de réclamation : signé, propre à l'annonceur, à durée limitée, mort après un STOP ou
 * une révocation. Rien n'est stocké : le même `émis_à` redonne le même jeton.
 */
class ClaimLinksTest extends TestCase
{
    use RefreshDatabase;

    private ClaimLinks $links;

    protected function setUp(): void
    {
        parent::setUp();
        $this->links = app(ClaimLinks::class);
        config(['radar.claim.link_ttl_days' => 30]);
    }

    private function refus(string $token): ApiError
    {
        try {
            $this->links->resolve($token);
        } catch (ApiError $e) {
            return $e;
        }
        $this->fail('Le lien aurait dû être refusé.');
    }

    public function test_le_jeton_se_recompose_a_l_identique_et_rend_son_annonceur(): void
    {
        $annonceur = RadarAdvertiser::factory()->create();
        $emis = now()->subDay();

        $jeton = $this->links->token($annonceur, $emis);

        $this->assertSame($jeton, $this->links->token($annonceur, $emis->copy()));
        $this->assertMatchesRegularExpression('/^'.ClaimLinks::TOKEN_PATTERN.'$/', $jeton);
        $this->assertTrue($this->links->resolve($jeton)->is($annonceur));
        $this->assertStringEndsWith('/fr/claim/'.$jeton, $this->links->url($annonceur, $emis, 'fr'));
    }

    public function test_un_jeton_falsifie_ou_d_un_autre_annonceur_rend_404_sans_distinction(): void
    {
        $annonceur = RadarAdvertiser::factory()->create();
        $autre = RadarAdvertiser::factory()->create();
        $jeton = $this->links->token($annonceur, now());
        [$id, $ts, $signature] = explode('.', $jeton);

        foreach ([
            $autre->id.'.'.$ts.'.'.$signature,               // la signature d'un autre annonceur
            $id.'.'.($ts - 86400).'.'.$signature,            // une date d'émission reculée pour allonger le lien
            $id.'.'.$ts.'.'.str_repeat('A', 22),
            '999999.'.$ts.'.'.$signature,
            'nimportequoi',
        ] as $faux) {
            $refus = $this->refus($faux);
            $this->assertSame(404, $refus->getStatusCode(), $faux);
            $this->assertSame('radar.claim.invalid', $refus->errorCode, $faux);
        }

        $orphelin = RadarAdvertiser::factory()->create();
        $jetonOrphelin = $this->links->token($orphelin, now());
        $orphelin->delete();
        $this->assertSame('radar.claim.invalid', $this->refus($jetonOrphelin)->errorCode);
    }

    public function test_le_lien_expire_apres_la_duree_de_configuration(): void
    {
        $annonceur = RadarAdvertiser::factory()->create();

        $this->assertTrue($this->links->resolve($this->links->token($annonceur, now()->subDays(29)))->is($annonceur));

        $refus = $this->refus($this->links->token($annonceur, now()->subDays(30)));
        $this->assertSame([410, 'radar.claim.expired'], [$refus->getStatusCode(), $refus->errorCode]);

        config(['radar.claim.link_ttl_days' => 60]);
        $this->assertTrue($this->links->resolve($this->links->token($annonceur, now()->subDays(30)))->is($annonceur));
    }

    public function test_un_jeton_emis_dans_le_futur_est_refuse(): void
    {
        $annonceur = RadarAdvertiser::factory()->create();

        $this->assertSame('radar.claim.invalid', $this->refus($this->links->token($annonceur, now()->addHour()))->errorCode);
    }

    public function test_apres_un_stop_le_lien_rend_410_quelle_que_soit_sa_date(): void
    {
        $annonceur = RadarAdvertiser::factory()->create();
        $jeton = $this->links->token($annonceur, now());
        $annonceur->forceFill(['do_not_contact_at' => now()])->save();

        $refus = $this->refus($jeton);
        $this->assertSame([410, 'radar.claim.revoked'], [$refus->getStatusCode(), $refus->errorCode]);
    }

    public function test_un_numero_purge_ou_un_accord_revoque_tue_le_lien(): void
    {
        $purge = RadarAdvertiser::factory()->create();
        $jetonPurge = $this->links->token($purge, now());
        $purge->forceFill(['phone' => null])->save();
        $this->assertSame('radar.claim.revoked', $this->refus($jetonPurge)->errorCode);

        $annonceur = RadarAdvertiser::factory()->create();
        $jeton = $this->links->token($annonceur, now());
        $operateur = User::factory()->create();
        $message = RadarOutreach::factory()->sent()->create(['radar_advertiser_id' => $annonceur->id, 'created_by_id' => $operateur->id]);
        $accord = RadarConsent::factory()->confirmed($operateur)->create(['radar_outreach_id' => $message->id]);
        $this->assertTrue($this->links->resolve($jeton)->is($annonceur));

        $accord->forceFill(['revoked_at' => now()])->save();
        $this->assertSame('radar.claim.revoked', $this->refus($jeton)->errorCode);
    }

    public function test_une_rotation_d_app_key_tue_le_lien_sauf_si_l_ancienne_cle_est_dans_app_previous_keys(): void
    {
        // TCK-2414 — le lien reste signé sous `app.key`, pas sous la clé dédiée des refus : une rotation peut le tuer.
        config(['app.key' => 'base64:YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=', 'app.previous_keys' => []]);
        $annonceur = RadarAdvertiser::factory()->create();
        $jeton = $this->links->token($annonceur, now());

        config(['app.key' => 'base64:YmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmI=']);
        $this->assertSame('radar.claim.invalid', $this->refus($jeton)->errorCode);
        $this->assertNull(ClaimLinks::phoneOf($jeton));

        config(['app.previous_keys' => ['base64:YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=']]);
        $this->assertTrue($this->links->resolve($jeton)->is($annonceur));
        $this->assertNotSame($jeton, $this->links->token($annonceur, now()->setTimestamp((int) explode('.', $jeton)[1])), 'un jeton neuf se signe sous la clé courante');

        config(['radar.phone_hmac_key' => 'cle-dediee-radar']);
        $this->assertTrue($this->links->resolve($jeton)->is($annonceur), 'la clé dédiée des refus ne signe pas les liens');
    }
}
