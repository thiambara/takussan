<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarExtraction;
use App\Ai\Usages\RadarExtractionUsage;
use App\Jobs\Radar\ExtractRadarListing;
use App\Jobs\Radar\FingerprintRadarSourcePhotos;
use App\Jobs\Radar\PurgeRadarAdvertiser;
use App\Models\AiCall;
use App\Models\AiSuggestion;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\ExternalContent;
use App\Services\Ai\PromptRepository;
use App\Services\Radar\ExtractionNormalizer;
use App\Services\Radar\HostResolver;
use App\Services\Radar\RadarListingIntake;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2466 (ADR-0087 §2) — l'extraction économe : ce que la page dit en clair (`source_fields`, TCK-2465) fait foi.
 *
 * - une valeur lue est retenue, confiance `high`, `source: page` ; le modèle ne la remplace jamais ;
 * - une valeur du modèle qui la contredit lève `source_conflict` sur le champ (AC2, AC4) ;
 * - quand la page dit type, contrat, prix, lieu et chambres (ou un type sans chambre), le modèle n'est pas appelé (AC1) ;
 * - le modèle ne reçoit que la liste courte « déjà lu » et le titre + la description (AC3).
 *
 * Aucun réseau ni modèle : `Http::fake`, `RadarExtraction::fake()`, un résolveur DNS doublé.
 */
class RadarExtractionSourceFieldsTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;
    use SocleIaDEssai;

    private const URL_CA = 'https://sn.coinafrique.com/annonce/villas/vente-villa-fictive-6-pieces-saly-8100001';

    /** Le numéro de `data-phone-number` de la fixture CoinAfrique. */
    private const ANNONCEUR_CA = '+221775550101';

    private const NUMERO_PAGE = '+221775550909';

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
                return $host === 'sn.coinafrique.com' ? ['93.184.216.34'] : [];
            }
        });

        $this->operateur = $this->operateur(PlatformProfileLevel::Support);
    }

    /**
     * Une sortie complète du modèle, chaque champ vide, sauf ceux donnés.
     *
     * @param  array<string, mixed>  $champs
     * @return array<string, mixed>
     */
    private function reponse(array $champs = []): array
    {
        $vide = ['value' => null, 'confidence' => 'low', 'evidence' => ''];
        $base = array_fill_keys([...RadarExtraction::PROPERTY_FIELDS, 'advertiser_name'], $vide);
        $base['advertiser_nature'] = ['value' => 'unknown', 'confidence' => 'low', 'evidence' => ''];
        $base['phones'] = [];
        $base['nature_signals'] = [];

        return array_replace($base, $champs);
    }

    /**
     * Ce qu'un adaptateur range dans `source_fields` (`ListingPage::sourceFields()`), complété par `$champs`.
     *
     * @param  array<string, mixed>  $champs
     * @return array<string, mixed>
     */
    private static function champsLus(array $champs = []): array
    {
        return array_replace([
            'phones' => [self::NUMERO_PAGE],
            'price' => 450000,
            'currency' => 'XOF',
            'contract' => 'rent',
            'property_type' => 'apartment',
            'rent_period' => 'monthly',
            'city' => 'Dakar',
            'neighborhood' => 'Almadies',
            'bedrooms' => 3,
            'rooms' => null,
            'bathrooms' => 2,
            'surface_m2' => null,
            'furnished' => null,
            'posted_at' => '2026-10-20T09:15:00+00:00',
            'seller_name' => 'Agence Fictive Immobilier',
            'seller_signals' => [['signal' => 'business_name', 'evidence' => 'Agence Fictive Immobilier']],
            'title' => 'Appartement fictif F4 aux Almadies',
        ], $champs);
    }

    /** Une annonce saisie par URL dont la page est déjà lue (le premier passage du job est fait). */
    private function annonceLue(array $champs = [], string $description = 'Bel appartement fictif, trois chambres, climatisé.'): RadarListing
    {
        $fields = self::champsLus($champs);
        $texte = trim(($fields['title'] ?? '')."\n".$description);

        return RadarListing::factory()->create([
            'source_kind' => RadarSourceKind::Url,
            'source_site' => RadarSourceSite::Coinafrique,
            'source_url' => 'https://sn.coinafrique.com/annonce/appartements/fictif-'.random_int(1000, 9999),
            'raw_text' => $texte,
            'source_fields' => $fields,
            'content_fingerprint' => hash('sha256', $texte.microtime()),
            'captured_by' => $this->operateur->id,
        ]);
    }

    private function lancer(RadarListing $listing): ExtractRadarListing
    {
        $job = (new ExtractRadarListing($listing->id))->withFakeQueueInteractions();
        $this->app->call([$job, 'handle']);

        return $job;
    }

    /** Saisie par URL de la fixture CoinAfrique de TCK-2465, puis le premier passage (la lecture de la page). */
    private function coinafriqueLue(): RadarListing
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/annonce/*' => Http::response(
                (string) file_get_contents(dirname(__DIR__, 2).'/fixtures/radar/coinafrique-listing.html'),
                200,
                ['Content-Type' => 'text/html; charset=utf-8'],
            ),
        ]);
        $listing = $this->app->make(RadarListingIntake::class)->fromUrls([self::URL_CA], $this->operateur)[0]['listing'];
        $this->lancer($listing)->assertReleased(0);

        return $listing->refresh();
    }

    // --- AC1 : l'appel sauté --------------------------------------------------------------------

    public function test_ac1_une_page_qui_dit_type_contrat_prix_lieu_et_chambres_est_extraite_sans_appel(): void
    {
        RadarExtraction::fake([$this->reponse()]);
        $listing = $this->annonceLue();

        $this->lancer($listing)->assertNotReleased();

        $listing->refresh();
        RadarExtraction::assertNeverPrompted();
        $this->assertSame(RadarListingStage::Extracted, $listing->stage);
        $this->assertSame(0, AiCall::query()->count(), 'Aucune ligne ai_calls : le modèle n\'a pas été appelé.');
        $this->assertSame(0, $listing->extraction_attempts, 'Aucune tentative n\'est comptée.');
        $this->assertSame(0, AiSuggestion::query()->count(), 'Sans appel, pas de suggestion du modèle à juger.');

        $e = $listing->extracted;
        foreach (['property_type' => 'apartment', 'contract' => 'rent', 'price' => 450000, 'city' => 'Dakar', 'neighborhood' => 'Almadies', 'bedrooms' => 3, 'bathrooms' => 2, 'rent_period' => 'monthly'] as $champ => $valeur) {
            $this->assertSame($valeur, $e[$champ]['value'], $champ);
            $this->assertSame('high', $e[$champ]['confidence'], $champ);
            $this->assertSame(ExtractionNormalizer::SOURCE_PAGE, $e[$champ]['source'] ?? null, $champ);
            $this->assertSame([], $e[$champ]['flags'], $champ);
        }
        $this->assertSame('Bel appartement fictif, trois chambres, climatisé.', $e['description']['value'], 'La description est le texte de la page, sans le titre.');
        $this->assertSame('Appartement fictif F4 aux Almadies', $e['title']['value']);
        $this->assertSame([self::NUMERO_PAGE], $e['phones']);
        $this->assertSame('agency', $e['advertiser_nature']['value'], 'Un nom d\'entreprise affiché par la page : agence probable.');
        $this->assertSame('medium', $e['advertiser_nature']['confidence']);
        $this->assertSame([['signal' => 'business_name', 'evidence' => 'Agence Fictive Immobilier']], $e['nature_signals']);
        $this->assertArrayHasKey('neighborhood_id', $e['neighborhood']);

        $annonceur = RadarAdvertiser::query()->sole();
        $this->assertSame($annonceur->id, $listing->radar_advertiser_id);
        $this->assertSame(self::NUMERO_PAGE, $annonceur->phone);
        $this->assertSame(RadarAdvertiserNature::Agency, $annonceur->nature);
        $this->assertSame('Agence Fictive Immobilier', $annonceur->display_name);
    }

    public function test_ac1_un_type_sans_chambre_se_passe_du_nombre_de_chambres(): void
    {
        RadarExtraction::fake([$this->reponse()]);
        $listing = $this->annonceLue(['property_type' => 'land', 'bedrooms' => null, 'bathrooms' => null, 'contract' => 'sale', 'rent_period' => null, 'price' => 15000000, 'seller_signals' => [['signal' => 'professional_badge', 'evidence' => 'Icone Professionel']], 'seller_name' => 'Fictif']);

        $this->lancer($listing);

        RadarExtraction::assertNeverPrompted();
        $listing->refresh();
        $this->assertSame(RadarListingStage::Extracted, $listing->stage);
        $this->assertSame(0, AiCall::query()->count());
        $this->assertSame('probable_intermediary', $listing->extracted['advertiser_nature']['value'], 'Un badge professionnel : intermédiaire probable.');
    }

    public function test_ac1_sans_indice_du_vendeur_la_nature_reste_inconnue(): void
    {
        RadarExtraction::fake([$this->reponse()]);
        $listing = $this->annonceLue(['seller_signals' => [['signal' => 'member_since', 'evidence' => 'Membre depuis 2021']], 'seller_name' => null]);

        $this->lancer($listing);

        RadarExtraction::assertNeverPrompted();
        $this->assertSame('unknown', $listing->refresh()->extracted['advertiser_nature']['value']);
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function pagesIncompletes(): iterable
    {
        yield 'sans chambres, pour un appartement' => [['bedrooms' => null]];
        yield 'sans prix' => [['price' => null]];
        yield 'sans contrat' => [['contract' => null]];
        yield 'sans type' => [['property_type' => null]];
        yield 'sans lieu' => [['city' => null, 'neighborhood' => null]];
        yield 'un type hors de l\'énumération' => [['property_type' => 'chateau']];
    }

    /** @param  array<string, mixed>  $manque */
    #[DataProvider('pagesIncompletes')]
    public function test_une_page_incomplete_appelle_le_modele(array $manque): void
    {
        RadarExtraction::fake([$this->reponse()]);
        $listing = $this->annonceLue($manque);

        $this->lancer($listing);

        RadarExtraction::assertPrompted(fn () => true);
        $this->assertSame(1, AiCall::query()->count());
        $this->assertSame(RadarListingStage::Extracted, $listing->refresh()->stage);
    }

    public function test_un_lieu_partiel_suffit(): void
    {
        RadarExtraction::fake([$this->reponse()]);
        $listing = $this->annonceLue(['neighborhood' => null]);

        $this->lancer($listing);

        RadarExtraction::assertNeverPrompted();
        $this->assertSame(RadarListingStage::Extracted, $listing->refresh()->stage);
    }

    // --- AC2, AC4 : la valeur lue fait foi, la contradiction se signale -------------------------

    public function test_ac2_le_prix_lu_l_emporte_sur_celui_du_modele_et_la_contradiction_est_signalee(): void
    {
        RadarExtraction::fake([$this->reponse([
            'price' => ['value' => '120 000 000 FCFA', 'confidence' => 'high', 'evidence' => 'Prix négociable'],
            'bedrooms' => ['value' => 4, 'confidence' => 'high', 'evidence' => '4 chambres'],
        ])]);
        $listing = $this->coinafriqueLue();
        $this->assertSame(95000000, $listing->source_fields['price']);

        $this->lancer($listing)->assertNotReleased();

        $listing->refresh();
        $this->assertSame(RadarListingStage::Extracted, $listing->stage);
        $prix = $listing->extracted['price'];
        $this->assertSame(95000000, $prix['value'], 'Le prix lu sur la page est gardé.');
        $this->assertSame('high', $prix['confidence']);
        $this->assertSame(ExtractionNormalizer::SOURCE_PAGE, $prix['source']);
        $this->assertContains(ExtractionNormalizer::FLAG_SOURCE_CONFLICT, $prix['flags']);
        $this->assertSame(120000000, $prix['model_value'], 'La valeur contredite reste lisible à la relecture.');

        // Ce que la page ne dit pas vient du modèle, relu comme avant.
        $this->assertSame(4, $listing->extracted['bedrooms']['value']);
        $this->assertNull($listing->extracted['bedrooms']['source'] ?? null);
        // Une valeur lue que le modèle ne contredit pas ne porte aucun drapeau.
        $this->assertSame('villa', $listing->extracted['property_type']['value']);
        $this->assertSame([], $listing->extracted['property_type']['flags']);
        $this->assertSame(1, $listing->extraction_attempts);
    }

    public function test_le_nom_lu_sur_la_page_enrichit_l_annonceur_meme_contredit(): void
    {
        RadarExtraction::fake([$this->reponse([
            'advertiser_name' => ['value' => 'Autre Nom Fictif', 'confidence' => 'high', 'evidence' => 'Villa fictive'],
        ])]);
        $listing = $this->coinafriqueLue();

        $this->lancer($listing);

        $listing->refresh();
        $this->assertSame([ExtractionNormalizer::FLAG_SOURCE_CONFLICT], $listing->extracted['advertiser_name']['flags']);
        $annonceur = RadarAdvertiser::query()->findOrFail($listing->radar_advertiser_id);
        $this->assertSame(self::ANNONCEUR_CA, $annonceur->phone);
        $this->assertSame('Agence Fictive Immobilier', $annonceur->display_name, 'La valeur lue fait foi : la contradiction du modèle ne la retient pas.');
        $this->assertSame(RadarAdvertiserNature::Agency, $annonceur->nature, 'Le modèle n\'a rien dit de la nature : celle des indices du vendeur.');
        $this->assertSame(self::ANNONCEUR_CA, $listing->extracted['phones'][0], 'Le numéro lu sur la page passe devant.');
    }

    public function test_une_valeur_egale_au_repli_pres_n_est_pas_une_contradiction(): void
    {
        $normalizer = app(ExtractionNormalizer::class);
        $sortie = $this->reponse([
            'neighborhood' => ['value' => 'almadies ', 'confidence' => 'high', 'evidence' => 'Almadies'],
            'city' => ['value' => 'DAKAR', 'confidence' => 'high', 'evidence' => 'Dakar'],
            'price' => ['value' => '450.000f', 'confidence' => 'high', 'evidence' => '450.000f'],
            'property_type' => ['value' => 'villa', 'confidence' => 'high', 'evidence' => 'appartement'],
        ]);

        $out = $normalizer->normalize($sortie, 'Appartement aux Almadies, Dakar, 450.000f', self::champsLus());

        $this->assertSame([], $out['neighborhood']['flags']);
        $this->assertSame([], $out['city']['flags']);
        $this->assertSame([], $out['price']['flags']);
        $this->assertSame('apartment', $out['property_type']['value']);
        $this->assertSame([ExtractionNormalizer::FLAG_SOURCE_CONFLICT], $out['property_type']['flags']);
        $this->assertSame('villa', $out['property_type']['model_value']);
        $this->assertSame('high', $out['property_type']['confidence'], 'La contradiction accuse le modèle, pas la page.');
    }

    public function test_une_valeur_lue_hors_bornes_reste_signalee_et_rabaissee(): void
    {
        $out = app(ExtractionNormalizer::class)->normalize($this->reponse(), 'Appartement', self::champsLus(['price' => 5]));

        $this->assertSame(5, $out['price']['value']);
        $this->assertSame([ExtractionNormalizer::FLAG_OUT_OF_BOUNDS], $out['price']['flags']);
        $this->assertSame('low', $out['price']['confidence']);
    }

    public function test_sans_champ_lu_la_normalisation_ne_change_pas(): void
    {
        $normalizer = app(ExtractionNormalizer::class);
        $sortie = $this->reponse(['price' => ['value' => '450.000f', 'confidence' => 'high', 'evidence' => '450.000f']]);

        $this->assertSame($normalizer->normalize($sortie, 'Prix 450.000f'), $normalizer->normalize($sortie, 'Prix 450.000f', null));
        $this->assertSame($normalizer->normalize($sortie, 'Prix 450.000f'), $normalizer->normalize($sortie, 'Prix 450.000f', ['phones' => []]));
        $this->assertArrayNotHasKey('source', $normalizer->normalize($sortie, 'Prix 450.000f')['price']);
    }

    // --- AC3 : ce que le modèle reçoit ----------------------------------------------------------

    public function test_ac3_le_modele_ne_recoit_que_le_deja_lu_le_titre_et_la_description(): void
    {
        $recu = null;
        RadarExtraction::fake(function (string $prompt) use (&$recu) {
            $recu = $prompt;

            return $this->reponse();
        });
        $listing = $this->coinafriqueLue();

        $this->lancer($listing);

        $this->assertNotNull($recu);
        $this->assertLessThan(2000, mb_strlen($recu), 'Moins de 2 000 caractères (6 041 avant TCK-2465).');
        $this->assertStringContainsString('contenu_externe_', $recu, 'Toujours délimité comme une donnée externe.');
        $this->assertSame(1, substr_count($recu, '</'.ExternalContent::TAG_PREFIX), 'Un seul bloc délimité.');
        $this->assertStringContainsString(ExtractionNormalizer::KNOWN_HEADER, $recu);
        $this->assertStringContainsString('property_type: villa', $recu);
        $this->assertStringContainsString('price: 95000000 XOF', $recu);
        $this->assertStringContainsString('Villa fictive à vendre à Saly Portudal.', $recu);
        $this->assertStringNotContainsString('Agence Fictive Immobilier', $recu, 'Le nom du vendeur ne sert à aucun champ manquant : il ne part pas.');
        $this->assertStringNotContainsString('75550101', $recu, 'Le numéro lu dans les attributs ne part pas.');
        $this->assertSame(4, AiCall::query()->sole()->prompt_version, 'Le prompt qui sait lire « déjà lu » est la v4.');
    }

    public function test_le_prompt_joue_nomme_la_liste_que_le_job_ecrit(): void
    {
        $prompt = app(PromptRepository::class)->load('radar.extraction', (new RadarExtractionUsage)->promptVersion());

        foreach ([ExtractionNormalizer::KNOWN_HEADER, ExtractionNormalizer::TEXT_HEADER, 'title, description: le texte ci-dessous', '`pieces`'] as $attendu) {
            $this->assertStringContainsString(rtrim($attendu, ' :'), $prompt);
        }
    }

    public function test_une_annonce_sans_champ_lu_garde_exactement_l_entree_du_jeu_d_evaluation(): void
    {
        $recu = null;
        RadarExtraction::fake(function (string $prompt) use (&$recu) {
            $recu = $prompt;

            return $this->reponse();
        });
        $listing = RadarListing::factory()->create(['raw_text' => 'Studio à louer à Ngor, 150.000f/mois', 'captured_by' => $this->operateur->id]);

        $this->lancer($listing);

        $this->assertSame(ExternalContent::wrap(RadarSourceSite::Other->value, 'Studio à louer à Ngor, 150.000f/mois'), $recu);
    }

    public function test_le_role_extraction_part_sur_haiku_avec_sonnet_en_repli(): void
    {
        $roles = require config_path('ai.php');

        $this->assertSame(
            ['claude-haiku-5-5', 'claude-sonnet-5-5'],
            array_column($roles['roles']['extraction'], 'model'),
        );
    }
}
