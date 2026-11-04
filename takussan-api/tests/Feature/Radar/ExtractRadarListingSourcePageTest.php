<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarExtraction;
use App\Http\Resources\Api\Admin\RadarListingResource;
use App\Jobs\Radar\ExtractRadarListing;
use App\Jobs\Radar\FingerprintRadarSourcePhotos;
use App\Jobs\Radar\PurgeRadarAdvertiser;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;
use App\Services\Radar\HostResolver;
use App\Services\Radar\RadarListingIntake;
use App\Services\Radar\RadarListingReview;
use App\Services\Radar\RadarPurger;
use App\Support\RadarPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2465 (ADR-0087 §1, §3) — l'extraction lit la page d'une annonce par l'adaptateur de son site : le numéro que la
 * page ne porte QUE dans ses attributs (CoinAfrique) rattache l'annonceur, même quand le modèle n'en rend aucun ; il passe
 * devant ceux du texte, le refus STOP se juge aussi sur lui, et un numéro du site n'est jamais celui d'un annonceur.
 *
 * Aucun réseau ni modèle : `Http::fake`, `RadarExtraction::fake()`, un résolveur DNS doublé. Fixtures écrites à la main.
 */
class ExtractRadarListingSourcePageTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;
    use SocleIaDEssai;

    private const URL_CA = 'https://sn.coinafrique.com/annonce/villas/vente-villa-fictive-6-pieces-saly-8100001';

    private const URL_ED = 'https://www.expat-dakar.com/annonce/villa-fictive-f5-avec-piscine-8200001';

    /** Le numéro de `data-phone-number` de la fixture CoinAfrique. */
    private const ANNONCEUR_CA = '+221775550101';

    private User $operateur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);

        Http::preventStrayRequests();
        Bus::fake([FingerprintRadarSourcePhotos::class, PurgeRadarAdvertiser::class, ExtractRadarListing::class]);
        Cache::flush();
        $this->app->instance(HostResolver::class, new class implements HostResolver
        {
            public function resolve(string $host): array
            {
                return in_array($host, ['sn.coinafrique.com', 'www.expat-dakar.com'], true) ? ['93.184.216.34'] : [];
            }
        });

        $this->operateur = $this->operateur(PlatformProfileLevel::Support);
    }

    private static function fixture(string $name): string
    {
        return (string) file_get_contents(dirname(__DIR__, 2).'/fixtures/radar/'.$name);
    }

    private function servir(string $hote, string $corps): void
    {
        Http::fake([
            "https://{$hote}/robots.txt" => Http::response('', 404),
            "https://{$hote}/annonce/*" => Http::response($corps, 200, ['Content-Type' => 'text/html; charset=utf-8']),
        ]);
    }

    /**
     * Une sortie complète du modèle, chaque champ vide, sans aucun numéro.
     *
     * @param  array<string, mixed>  $champs
     * @return array<string, mixed>
     */
    private function reponse(array $champs = []): array
    {
        $vide = ['value' => null, 'confidence' => 'low', 'evidence' => null];
        $base = array_fill_keys([...RadarExtraction::PROPERTY_FIELDS, 'advertiser_name'], $vide);
        $base['advertiser_nature'] = ['value' => 'unknown', 'confidence' => 'low', 'evidence' => null];
        $base['phones'] = [];
        $base['nature_signals'] = [];

        return array_replace($base, $champs);
    }

    private function saisir(string $url): RadarListing
    {
        $result = $this->app->make(RadarListingIntake::class)->fromUrls([$url], $this->operateur)[0];

        return $result['listing'];
    }

    private function lancer(RadarListing $listing): ExtractRadarListing
    {
        $job = (new ExtractRadarListing($listing->id))->withFakeQueueInteractions();
        $this->app->call([$job, 'handle']);

        return $job;
    }

    public function test_ac3_une_annonce_coinafrique_saisie_par_url_est_rattachee_au_numero_de_data_phone_number(): void
    {
        RadarExtraction::fake([$this->reponse()]);
        $this->servir('sn.coinafrique.com', self::fixture('coinafrique-listing.html'));
        $listing = $this->saisir(self::URL_CA);
        $this->assertSame(RadarSourceSite::Coinafrique, $listing->source_site);

        $this->lancer($listing)->assertReleased(0);
        $listing->refresh();
        $this->assertSame(RadarListingStage::Captured, $listing->stage);
        $this->assertSame([self::ANNONCEUR_CA], $listing->source_fields['phones']);
        $this->assertSame(95000000, $listing->source_fields['price']);
        $this->assertArrayNotHasKey('description', $listing->source_fields);
        $this->assertCount(4, $listing->photo_urls);
        $this->assertStringStartsWith("Vente villa fictive 6 pièces - Saly\nVilla fictive à vendre à Saly Portudal.", (string) $listing->raw_text);
        $this->assertStringNotContainsString('Voitures', (string) $listing->raw_text);
        $this->assertSame([], RadarPhone::fromText((string) $listing->raw_text), 'Le texte ne porte aucun numéro : seul l\'attribut le donne.');

        $this->lancer($listing)->assertNotReleased();

        $listing->refresh();
        $this->assertSame(RadarListingStage::Extracted, $listing->stage);
        $advertiser = RadarAdvertiser::query()->findOrFail($listing->radar_advertiser_id);
        $this->assertSame(self::ANNONCEUR_CA, $advertiser->phone);
    }

    public function test_le_numero_des_attributs_passe_devant_celui_du_texte_et_celui_du_modele(): void
    {
        RadarExtraction::fake([$this->reponse(['phones' => ['77 555 03 03']])]);
        $page = str_replace('Titre foncier. Prix négociable.', 'Titre foncier. Gardien : 77 555 03 03.', self::fixture('coinafrique-listing.html'));
        $this->servir('sn.coinafrique.com', $page);
        $listing = $this->saisir(self::URL_CA);

        $this->lancer($listing);
        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::Extracted, $listing->stage);
        $this->assertSame(self::ANNONCEUR_CA, RadarAdvertiser::query()->findOrFail($listing->radar_advertiser_id)->phone);
    }

    public function test_un_stop_sur_le_numero_des_attributs_refuse_l_annonce_des_la_lecture_sans_appeler_le_modele(): void
    {
        RadarExtraction::fake();
        $stop = RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac(self::ANNONCEUR_CA)]);
        $this->servir('sn.coinafrique.com', self::fixture('coinafrique-listing.html'));
        $listing = $this->saisir(self::URL_CA);

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::DoNotContact, $listing->stage);
        $this->assertSame($stop->id, $listing->radar_advertiser_id);
        RadarExtraction::assertNeverPrompted();
    }

    public function test_un_stop_dit_apres_la_lecture_est_rejuge_sur_le_numero_des_attributs_avant_l_appel(): void
    {
        RadarExtraction::fake();
        $this->servir('sn.coinafrique.com', self::fixture('coinafrique-listing.html'));
        $listing = $this->saisir(self::URL_CA);
        $this->lancer($listing)->assertReleased(0);
        RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac(self::ANNONCEUR_CA)]);

        $this->lancer($listing);

        $this->assertSame(RadarListingStage::DoNotContact, $listing->refresh()->stage);
        RadarExtraction::assertNeverPrompted();
    }

    public function test_ac2_le_numero_du_site_n_est_jamais_celui_de_l_annonceur_meme_ecrit_dans_le_texte(): void
    {
        RadarExtraction::fake([$this->reponse(['phones' => ['76 644 86 13']])]);
        // La description cite le numéro du site, et la page ne porte aucun numéro d'annonceur.
        $page = str_replace(
            ['<p>Quatre chambres, piscine, jardin.</p>', 'tel:+221775550202', '%2B221775550202', 'wa.me/221775550202'],
            ['<p>Quatre chambres. Infos : 76 644 86 13.</p>', 'tel:', '', 'wa.me/'],
            self::fixture('expat-dakar-listing.html'),
        );
        $this->servir('www.expat-dakar.com', $page);
        $listing = $this->saisir(self::URL_ED);
        $this->assertSame(RadarSourceSite::ExpatDakar, $listing->source_site);

        $this->lancer($listing);
        $this->assertSame([], $listing->refresh()->source_fields['phones']);
        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame(RadarListingStage::Extracted, $listing->stage);
        $this->assertNull($listing->radar_advertiser_id);
        $this->assertSame(0, RadarAdvertiser::query()->count());
    }

    public function test_une_page_que_l_adaptateur_ne_reconnait_pas_retombe_sur_le_lecteur_generique_qui_garde_les_numeros_des_attributs(): void
    {
        RadarExtraction::fake([$this->reponse()]);
        $this->servir('sn.coinafrique.com', '<html><head><title>Villa Ngor</title></head><body><p>Villa à louer à Ngor, vue mer.</p>'
            .'<a href="tel:+221775550404">Appeler</a><a href="tel:+221765694843">Service CoinAfrique</a></body></html>');
        $listing = $this->saisir('https://sn.coinafrique.com/annonce/villas/villa-ngor-8100002');

        $this->lancer($listing);

        $listing->refresh();
        $this->assertStringContainsString('Villa à louer à Ngor', (string) $listing->raw_text);
        $this->assertSame(['phones' => ['+221775550404']], $listing->source_fields, 'Le numéro du service de CoinAfrique est écarté.');

        $this->lancer($listing);
        $this->assertSame('+221775550404', RadarAdvertiser::query()->findOrFail($listing->refresh()->radar_advertiser_id)->phone);
    }

    public function test_un_site_sans_adaptateur_garde_les_numeros_du_lecteur_generique(): void
    {
        RadarExtraction::fake([$this->reponse()]);
        $this->app->instance(HostResolver::class, new class implements HostResolver
        {
            public function resolve(string $host): array
            {
                return $host === 'www.annonces-fictives.sn' ? ['93.184.216.34'] : [];
            }
        });
        Http::fake([
            'https://www.annonces-fictives.sn/robots.txt' => Http::response('', 404),
            'https://www.annonces-fictives.sn/*' => Http::response('<html><body><p>Studio meublé à Ouakam.</p><button data-phone-number="+221775550505">Voir</button></body></html>', 200, ['Content-Type' => 'text/html']),
        ]);
        $listing = $this->saisir('https://www.annonces-fictives.sn/annonce/1');
        $this->assertSame(RadarSourceSite::Other, $listing->source_site);

        $this->lancer($listing);

        $this->assertSame(['phones' => ['+221775550505']], $listing->refresh()->source_fields);
    }

    public function test_la_fiche_rend_les_champs_lus_et_l_operateur_peut_rattacher_le_numero_des_attributs(): void
    {
        RadarExtraction::fake([$this->reponse()]);
        $this->servir('sn.coinafrique.com', self::fixture('coinafrique-listing.html'));
        $listing = $this->saisir(self::URL_CA);
        $this->lancer($listing);
        $this->lancer($listing);
        $listing->refresh()->forceFill(['radar_advertiser_id' => null])->save();

        $rendu = (new RadarListingResource($listing->refresh()))->toArray(new Request);
        $this->assertSame([self::ANNONCEUR_CA], $rendu['source_fields']['phones']);
        $this->assertSame('Agence Fictive Immobilier', $rendu['source_fields']['seller_name']);

        $this->app->make(RadarListingReview::class)->setAdvertiser($listing, self::ANNONCEUR_CA, $this->operateur);
        $this->assertSame(self::ANNONCEUR_CA, RadarAdvertiser::query()->findOrFail($listing->refresh()->radar_advertiser_id)->phone);
    }

    public function test_la_purge_efface_les_champs_lus(): void
    {
        $listing = RadarListing::factory()->create([
            'source_kind' => RadarSourceKind::Url,
            'source_site' => RadarSourceSite::Coinafrique,
            'source_url' => self::URL_CA,
            'source_fields' => ['phones' => [self::ANNONCEUR_CA], 'seller_name' => 'Agence Fictive Immobilier'],
            'purge_at' => now()->subDay(),
            'captured_by' => $this->operateur->id,
        ]);

        $this->app->make(RadarPurger::class)->run();

        $listing->refresh();
        $this->assertSame(RadarListingStage::Purged, $listing->stage);
        $this->assertNull($listing->source_fields);
    }
}
