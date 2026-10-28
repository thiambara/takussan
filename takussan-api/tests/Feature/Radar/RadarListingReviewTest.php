<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarExtraction;
use App\Ai\Usages\RadarExtractionUsage;
use App\Exceptions\ApiError;
use App\Jobs\Radar\ExtractRadarListing;
use App\Jobs\Radar\FingerprintRadarSourcePhotos;
use App\Models\Address;
use App\Models\AiSuggestion;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;
use App\Services\Radar\RadarListingReview;
use App\Services\Radar\RadarReviewFields;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2387 (ADR-0077 §5, §6) — la relecture d'une fiche extraite : corriger (`PATCH`), valider (`POST
 * …/review`), et lire les rapprochements (`GET …/matches`). La décision de la suggestion se prend à la
 * validation, une fois ; corriger ne décide rien.
 */
class RadarListingReviewTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;
    use SocleIaDEssai;

    private const NUMERO = '+221771234567';

    private User $operateur;

    private GeoNeighborhood $quartier;

    protected function setUp(): void
    {
        parent::setUp();
        // Sous `sync`, le calcul des empreintes partirait sur le réseau.
        Bus::fake([FingerprintRadarSourcePhotos::class]);
        Http::preventStrayRequests();
        $this->operateur = $this->operateur(PlatformProfileLevel::Support);
        $this->actingAsWithStepUp($this->operateur);
        $this->quartier = GeoNeighborhood::factory()->create();
    }

    /**
     * Une fiche lue, rattachée à un quartier, et la suggestion que le job a enregistrée : ses valeurs.
     *
     * @param  array<string, mixed>  $extracted
     * @param  array<string, mixed>  $attributes
     */
    private function fiche(array $extracted = [], array $attributes = [], bool $suggestion = true): RadarListing
    {
        $listing = RadarListing::factory()->extracted($extracted + [
            'neighborhood' => ['neighborhood_id' => $this->quartier->id],
        ])->create($attributes);

        if ($suggestion) {
            $this->suggestion($listing);
        }

        return $listing;
    }

    private function suggestion(RadarListing $listing): AiSuggestion
    {
        return AiSuggestion::query()->create([
            'usage_key' => RadarExtractionUsage::KEY,
            'subject_type' => $listing->getMorphClass(),
            'subject_id' => $listing->id,
            'proposal' => RadarReviewFields::values($listing->extracted),
            'decision' => AiSuggestionDecision::Pending,
        ]);
    }

    private function url(RadarListing $listing, string $suffix = ''): string
    {
        return "/api/admin/radar/listings/{$listing->id}{$suffix}";
    }

    // --- AC1 : la décision de la suggestion, à la validation ----------------------------------

    public function test_ac1_corriger_le_prix_puis_valider_passe_la_suggestion_en_edited_avec_le_differentiel(): void
    {
        $listing = $this->fiche();

        $this->patchJson($this->url($listing), ['price' => 400000])->assertOk();
        $this->postJson($this->url($listing, '/review'))->assertOk()->assertJsonPath('data.stage', 'reviewed');

        $suggestion = AiSuggestion::query()->sole();
        $this->assertSame(AiSuggestionDecision::Edited, $suggestion->decision);
        // jsonb ne garde pas l'ordre des clés : `assertEquals` compare les tableaux associatifs sans lui.
        $this->assertEquals(['price' => ['from' => 450000, 'to' => 400000]], $suggestion->correction_diff);
        $this->assertSame(400000, $suggestion->final_value['price']);
        $this->assertSame($this->operateur->id, $suggestion->decided_by_id);
    }

    public function test_ac1_valider_sans_rien_corriger_passe_la_suggestion_en_accepted(): void
    {
        $listing = $this->fiche();

        $this->postJson($this->url($listing, '/review'))->assertOk();

        $suggestion = AiSuggestion::query()->sole();
        $this->assertSame(AiSuggestionDecision::Accepted, $suggestion->decision);
        $this->assertSame([], $suggestion->correction_diff);
        $this->assertSame($this->operateur->id, $suggestion->decided_by_id);
    }

    public function test_ac1_corriger_une_valeur_pour_la_meme_valeur_reste_accepted(): void
    {
        $listing = $this->fiche();

        // Le même prix, envoyé en chaîne : une correction qui ne corrige rien ne fait pas une décision `edited`.
        $this->patchJson($this->url($listing), ['price' => '450000', 'bedrooms' => '3'])->assertOk();
        $this->postJson($this->url($listing, '/review'))->assertOk();

        $this->assertSame(AiSuggestionDecision::Accepted, AiSuggestion::query()->sole()->decision);
    }

    public function test_ac1_de_bout_en_bout_par_le_job(): void
    {
        $this->installerSocleDEssai();
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);
        Cache::flush();

        $vide = ['value' => null, 'confidence' => 'low', 'evidence' => null];
        $reponse = array_fill_keys([...RadarExtraction::PROPERTY_FIELDS, 'advertiser_name'], $vide);
        $reponse['advertiser_nature'] = ['value' => 'unknown', 'confidence' => 'low', 'evidence' => null];
        $reponse['phones'] = [];
        $reponse['nature_signals'] = [];
        $reponse['property_type'] = ['value' => 'apartment', 'confidence' => 'high', 'evidence' => 'Appartement'];
        $reponse['contract'] = ['value' => 'rent', 'confidence' => 'high', 'evidence' => 'à louer'];
        $reponse['price'] = ['value' => '450.000f/mois', 'confidence' => 'high', 'evidence' => '450.000f/mois'];
        $reponse['neighborhood'] = ['value' => 'Quartier introuvable', 'confidence' => 'medium', 'evidence' => 'Quartier introuvable'];
        RadarExtraction::fake([$reponse]);

        $listing = RadarListing::factory()->create([
            'raw_text' => 'Appartement à louer, Quartier introuvable, 450.000f/mois',
            'captured_by' => $this->operateur->id,
        ]);
        $job = (new ExtractRadarListing($listing->id))->withFakeQueueInteractions();
        $this->app->call([$job, 'handle']);

        $this->assertSame(RadarListingStage::Extracted, $listing->fresh()->stage);
        $this->assertNull($listing->fresh()->extracted['neighborhood']['neighborhood_id']);

        // Non rattaché : la validation attend le quartier, que l'opérateur choisit.
        $this->postJson($this->url($listing, '/review'))->assertStatus(422)->assertJsonPath('params.fields', ['neighborhood_id']);
        $this->patchJson($this->url($listing), ['neighborhood_id' => $this->quartier->id])->assertOk();
        $this->postJson($this->url($listing, '/review'))->assertOk();

        $suggestion = AiSuggestion::query()->sole();
        $this->assertSame(AiSuggestionDecision::Edited, $suggestion->decision);
        $this->assertEquals(['neighborhood_id' => ['from' => null, 'to' => $this->quartier->id]], $suggestion->correction_diff);
    }

    public function test_une_annonce_sans_suggestion_se_valide_quand_meme_et_le_journal_le_dit(): void
    {
        $listing = $this->fiche(suggestion: false);

        $this->postJson($this->url($listing, '/review'))->assertOk()->assertJsonPath('data.stage', 'reviewed');

        $journal = Activity::query()->where('event', 'radar_listing_reviewed')->sole();
        $this->assertNull($journal->properties['suggestion_id']);
        $this->assertNull($journal->properties['decision']);
        $this->assertSame([], $journal->properties['corrected_fields']);
    }

    // --- AC5 : valider exige de quoi publier --------------------------------------------------

    public function test_ac5_valider_sans_quartier_rattache_rend_422(): void
    {
        $listing = $this->fiche(['neighborhood' => ['neighborhood_id' => null]]);

        $this->postJson($this->url($listing, '/review'))
            ->assertStatus(422)
            ->assertJsonPath('code', 'radar.review.incomplete')
            ->assertJsonPath('params.fields', ['neighborhood_id']);

        $this->assertSame(RadarListingStage::Extracted, $listing->fresh()->stage);
        $this->assertSame(AiSuggestionDecision::Pending, AiSuggestion::query()->sole()->decision);
    }

    /** @return array<string, array{0: string, 1: array<string, mixed>}> */
    public static function champsRequis(): array
    {
        return [
            'type' => ['property_type', ['property_type' => ['value' => null]]],
            'contrat' => ['contract', ['contract' => ['value' => null]]],
            'prix' => ['price', ['price' => ['value' => null]]],
        ];
    }

    #[DataProvider('champsRequis')]
    public function test_ac5_valider_sans_type_contrat_ou_prix_rend_422(string $champ, array $extracted): void
    {
        $listing = $this->fiche($extracted);

        $this->postJson($this->url($listing, '/review'))
            ->assertStatus(422)
            ->assertJsonPath('code', 'radar.review.incomplete')
            ->assertJsonPath('params.fields', [$champ]);

        $this->assertSame(RadarListingStage::Extracted, $listing->fresh()->stage);
        $this->assertSame(AiSuggestionDecision::Pending, AiSuggestion::query()->sole()->decision);
    }

    public function test_ac5_tous_les_champs_manquants_sont_nommes(): void
    {
        $listing = $this->fiche([
            'property_type' => ['value' => null], 'contract' => ['value' => null],
            'price' => ['value' => null], 'neighborhood' => ['neighborhood_id' => null],
        ]);

        $this->postJson($this->url($listing, '/review'))
            ->assertStatus(422)
            ->assertJsonPath('params.fields', ['property_type', 'contract', 'price', 'neighborhood_id']);
    }

    public function test_ac5_un_quartier_fusionne_depuis_la_correction_rend_422(): void
    {
        $listing = $this->fiche();
        $this->patchJson($this->url($listing), ['neighborhood_id' => $this->quartier->id])->assertOk();

        // Fusionné après la correction : le rattachement ne vaut plus.
        $cible = GeoNeighborhood::factory()->create();
        $this->quartier->forceFill(['merged_into_id' => $cible->id])->save();

        $this->postJson($this->url($listing, '/review'))
            ->assertStatus(422)
            ->assertJsonPath('params.fields', ['neighborhood_id']);
        $this->assertSame(RadarListingStage::Extracted, $listing->fresh()->stage);
    }

    public function test_ac5_un_quartier_refuse_depuis_la_correction_rend_422(): void
    {
        $listing = $this->fiche();
        $this->quartier->forceFill(['status' => 'rejected'])->save();

        $this->postJson($this->url($listing, '/review'))->assertStatus(422)->assertJsonPath('params.fields', ['neighborhood_id']);
    }

    // --- PATCH --------------------------------------------------------------------------------

    public function test_corriger_un_champ_le_marque_corrige_et_leve_ses_drapeaux(): void
    {
        $listing = $this->fiche(['price' => ['flags' => ['price_implausible']]]);

        $reponse = $this->patchJson($this->url($listing), ['price' => 400000, 'bedrooms' => 2, 'furnished' => true, 'amenities' => ['wifi']])
            ->assertOk()
            ->assertJsonPath('data.id', $listing->id)
            ->assertJsonPath('data.extracted.price.value', 400000)
            ->assertJsonPath('data.extracted.price.corrected', true)
            ->assertJsonPath('data.extracted.price.flags', [])
            ->assertJsonPath('data.extracted.bedrooms.value', 2)
            ->assertJsonPath('data.extracted.furnished.value', true)
            ->assertJsonPath('data.extracted.amenities.value', ['wifi']);

        // Le champ non touché garde sa lecture.
        $this->assertArrayNotHasKey('corrected', $reponse->json('data.extracted.bathrooms'));
        $this->assertSame('high', $reponse->json('data.extracted.price.confidence'));
    }

    public function test_corriger_le_quartier_rattache_et_rend_le_lien(): void
    {
        $autre = GeoNeighborhood::factory()->create();
        $listing = $this->fiche();

        $this->patchJson($this->url($listing), ['neighborhood_id' => $autre->id])
            ->assertOk()
            ->assertJsonPath('data.extracted.neighborhood.neighborhood_id', $autre->id)
            ->assertJsonPath('data.extracted.neighborhood.corrected', true)
            ->assertJsonPath('data.neighborhood_link.id', $autre->id)
            ->assertJsonPath('data.neighborhood_link.name', $autre->name)
            ->assertJsonPath('data.neighborhood_link.city', $autre->city->name);
    }

    public function test_un_quartier_envoye_en_chaine_est_stocke_en_entier_et_le_signal_de_lieu_le_lit(): void
    {
        $autre = GeoNeighborhood::factory()->create();
        $bien = Property::factory()->published()->create(['price' => 450000, 'bedrooms' => 3, 'contract_type' => 'rent']);
        Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'geo_neighborhood_id' => $autre->id]);
        $listing = $this->fiche(['neighborhood' => ['neighborhood_id' => null], 'phones' => []]);

        // Le matcher ne lit le lieu que si quartier, prix et chambres sont des NOMBRES JSON.
        $this->patchJson($this->url($listing), ['neighborhood_id' => (string) $autre->id, 'price' => '450000', 'bedrooms' => '3', 'bathrooms' => '2'])->assertOk();

        $extracted = $listing->fresh()->extracted;
        $this->assertSame($autre->id, $extracted['neighborhood']['neighborhood_id']);
        $this->assertSame(450000, $extracted['price']['value']);
        $this->assertSame(3, $extracted['bedrooms']['value']);
        $this->assertSame(2, $extracted['bathrooms']['value']);

        $this->getJson($this->url($listing, '/matches'))
            ->assertOk()
            ->assertJsonPath('data.matches.0.id', $bien->id)
            ->assertJsonPath('data.matches.0.signals.0.signal', 'neighborhood_price_bedrooms');
    }

    public function test_un_champ_peut_etre_efface_sauf_la_nature(): void
    {
        $listing = $this->fiche();

        $this->patchJson($this->url($listing), ['surface_m2' => null])->assertOk()->assertJsonPath('data.extracted.surface_m2.value', null);
        $this->patchJson($this->url($listing), ['advertiser_nature' => null])->assertStatus(422);
        $this->patchJson($this->url($listing), ['advertiser_nature' => 'agency'])->assertOk()->assertJsonPath('data.extracted.advertiser_nature.value', 'agency');
    }

    public function test_un_corps_vide_rend_422(): void
    {
        $listing = $this->fiche();

        $this->patchJson($this->url($listing), [])->assertStatus(422)->assertJsonPath('code', 'radar.listing.nothing_to_update');
        // Une clé inconnue ne compte pas.
        $this->patchJson($this->url($listing), ['phones' => ['+221700000000']])->assertStatus(422)->assertJsonPath('code', 'radar.listing.nothing_to_update');
        $this->assertEquals($listing->extracted, $listing->fresh()->extracted);
    }

    public function test_un_quartier_en_attente_ou_refuse_rend_422(): void
    {
        $listing = $this->fiche();
        $enAttente = GeoNeighborhood::factory()->create(['status' => 'pending']);
        $refuse = GeoNeighborhood::factory()->create(['status' => 'rejected']);
        $fusionne = GeoNeighborhood::factory()->create(['merged_into_id' => $this->quartier->id]);

        foreach ([$enAttente, $refuse, $fusionne] as $quartier) {
            $this->patchJson($this->url($listing), ['neighborhood_id' => $quartier->id])
                ->assertStatus(422)->assertJsonValidationErrors('neighborhood_id');
        }
        $this->patchJson($this->url($listing), ['neighborhood_id' => 999999999])->assertStatus(422);
        $this->assertSame($this->quartier->id, $listing->fresh()->extracted['neighborhood']['neighborhood_id']);
    }

    public function test_les_valeurs_hors_bornes_sont_refusees(): void
    {
        $listing = $this->fiche();

        foreach ([
            ['price' => 0], ['price' => 100_000_000_001], ['price' => 'cher'], ['price' => 450000.5],
            ['bedrooms' => -1], ['bedrooms' => 100], ['surface_m2' => 0], ['property_type' => 'chateau'],
            ['contract' => 'swap'], ['rent_period' => 'hourly'], ['advertiser_nature' => 'robot'],
            ['title' => str_repeat('a', 201)], ['amenities' => array_fill(0, 41, 'x')], ['amenities' => [str_repeat('a', 81)]],
            ['furnished' => 'peut-etre'],
        ] as $corps) {
            $this->patchJson($this->url($listing), $corps)->assertStatus(422);
        }
        $this->assertEquals($listing->extracted, $listing->fresh()->extracted);
    }

    public function test_un_prix_invraisemblable_mais_dans_les_bornes_s_ecrit(): void
    {
        $listing = $this->fiche();

        $this->patchJson($this->url($listing), ['price' => 5, 'bedrooms' => 40])->assertOk()
            ->assertJsonPath('data.extracted.price.value', 5);
    }

    public function test_corriger_sur_une_fiche_validee_ou_capturee_rend_409(): void
    {
        foreach ([RadarListingStage::Reviewed, RadarListingStage::Captured] as $etape) {
            $listing = $this->fiche(attributes: ['stage' => $etape]);

            $this->patchJson($this->url($listing), ['price' => 1])
                ->assertStatus(409)
                ->assertJsonPath('code', 'radar.listing.stage_conflict')
                ->assertJsonPath('params.stage', $etape->value);
            $this->assertSame(450000, $listing->fresh()->extracted['price']['value']);
        }
    }

    public function test_corriger_ne_decide_rien_sur_la_suggestion(): void
    {
        $listing = $this->fiche();

        $this->patchJson($this->url($listing), ['price' => 400000])->assertOk();
        $this->patchJson($this->url($listing), ['price' => 410000])->assertOk();

        $suggestion = AiSuggestion::query()->sole();
        $this->assertSame(AiSuggestionDecision::Pending, $suggestion->decision);
        $this->assertNull($suggestion->final_value);
        $this->assertNull($suggestion->decided_by_id);
        $this->assertSame(450000, $suggestion->proposal['price']);
    }

    public function test_le_journal_de_la_correction_nomme_les_champs_sans_les_valeurs(): void
    {
        $listing = $this->fiche();

        $this->patchJson($this->url($listing), ['price' => 400123, 'description' => 'Texte secret du vendeur'])->assertOk();

        $journal = Activity::query()->where('event', 'radar_listing_corrected')->sole();
        $this->assertSame($this->operateur->id, $journal->causer_id);
        $this->assertSame($listing->id, $journal->subject_id);
        $this->assertEqualsCanonicalizing(['price', 'description'], $journal->properties['fields']);
        $this->assertStringNotContainsString('400123', json_encode($journal->properties));
        $this->assertStringNotContainsString('secret', json_encode($journal->properties));
    }

    // --- review -------------------------------------------------------------------------------

    public function test_deux_validations_simultanees_la_seconde_rend_409(): void
    {
        $listing = $this->fiche();
        $perimee = RadarListing::query()->findOrFail($listing->id); // lue avant la première validation : `extracted`

        $this->postJson($this->url($listing, '/review'))->assertOk();

        // L'étape est relue sous verrou : une instance périmée ne rejoue pas la validation.
        try {
            $this->app->make(RadarListingReview::class)->review($perimee, $this->operateur);
            $this->fail('La seconde validation aurait dû être refusée.');
        } catch (ApiError $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
        $this->postJson($this->url($listing, '/review'))->assertStatus(409)->assertJsonPath('code', 'radar.listing.stage_conflict');
        $this->assertSame(1, Activity::query()->where('event', 'radar_listing_reviewed')->count());
    }

    public function test_valider_fige_les_rapprochements_dans_la_colonne_sans_donnee_personnelle(): void
    {
        $proprietaire = User::factory()->create(['phone' => self::NUMERO]);
        $bien = Property::factory()->published()->create(['user_id' => $proprietaire->id]);
        $listing = $this->fiche(['phones' => [self::NUMERO]]);

        $this->postJson($this->url($listing, '/review'))->assertOk();

        $figee = $listing->fresh()->matches;
        $this->assertCount(1, $figee);
        $this->assertSame('property', $figee[0]['kind']);
        $this->assertSame($bien->id, $figee[0]['id']);
        $this->assertSame('phone', $figee[0]['signals'][0]['signal']);
        $this->assertEqualsCanonicalizing(['kind', 'id', 'strength', 'signals'], array_keys($figee[0]));
        $this->assertStringNotContainsString('771234567', json_encode($figee));
    }

    public function test_valider_rend_la_fiche_et_le_journal_porte_la_decision(): void
    {
        $listing = $this->fiche();
        $this->patchJson($this->url($listing), ['price' => 400000])->assertOk();

        $this->postJson($this->url($listing, '/review'))
            ->assertOk()
            ->assertJsonPath('data.stage', 'reviewed')
            ->assertJsonPath('data.neighborhood_link.id', $this->quartier->id);

        $suggestion = AiSuggestion::query()->sole();
        $journal = Activity::query()->where('event', 'radar_listing_reviewed')->sole();
        $this->assertSame($suggestion->id, $journal->properties['suggestion_id']);
        $this->assertSame('edited', $journal->properties['decision']);
        $this->assertSame(['price'], $journal->properties['corrected_fields']);
    }

    public function test_valider_sur_une_etape_qui_ne_le_permet_pas_rend_409(): void
    {
        foreach ([RadarListingStage::Captured, RadarListingStage::Reviewed, RadarListingStage::Duplicate] as $etape) {
            $listing = $this->fiche(attributes: ['stage' => $etape]);

            $this->postJson($this->url($listing, '/review'))->assertStatus(409)->assertJsonPath('params.stage', $etape->value);
        }
    }

    // --- AC2 : les rapprochements -------------------------------------------------------------

    public function test_ac2_la_route_des_rapprochements_rend_signal_et_force(): void
    {
        $proprietaire = User::factory()->create(['phone' => self::NUMERO]);
        $bien = Property::factory()->published()->create(['user_id' => $proprietaire->id, 'price' => 450000, 'bedrooms' => 2]);
        $listing = $this->fiche(['phones' => [self::NUMERO]], [
            'source_kind' => RadarSourceKind::Url,
            'source_site' => RadarSourceSite::Coinafrique,
            'source_url' => 'https://sn.coinafrique.com/annonce/42',
            'photo_urls' => ['https://img.example/1.jpg', 'https://img.example/2.jpg'],
        ]);

        $premier = $this->getJson($this->url($listing, '/matches'))->assertOk();
        $this->getJson($this->url($listing, '/matches'))->assertOk();

        $premier
            ->assertJsonPath('data.matches.0.kind', 'property')
            ->assertJsonPath('data.matches.0.id', $bien->id)
            ->assertJsonPath('data.matches.0.strength', 'medium')
            ->assertJsonPath('data.matches.0.signals.0.signal', 'phone')
            ->assertJsonPath('data.matches.0.target.title', $bien->title)
            ->assertJsonPath('data.matches.0.target.price', 450000)
            ->assertJsonPath('data.matches.0.target.bedrooms', 2)
            ->assertJsonPath('data.matches.0.target.status', $bien->status->value)
            ->assertJsonPath('data.matches.0.target.is_public', true)
            ->assertJsonPath('data.matches.0.target.slug', $bien->slug)
            ->assertJsonPath('data.matches.0.target.reference_number', $bien->reference_number)
            ->assertJsonPath('data.matches.0.target.thumbnail_url', null)
            ->assertJsonPath('data.photos', ['status' => 'pending', 'total' => 2, 'done' => 0]);

        // Aucun numéro, ni celui de l'annonce ni celui du propriétaire.
        $this->assertStringNotContainsString('771234567', $premier->getContent());
        // Le calcul des empreintes est mis en file une seule fois, malgré deux ouvertures.
        Bus::assertDispatchedTimes(FingerprintRadarSourcePhotos::class, 1);
    }

    public function test_la_vignette_d_un_bien_est_la_conversion_de_sa_premiere_photo(): void
    {
        $proprietaire = User::factory()->create(['phone' => self::NUMERO]);
        $avecPhotos = Property::factory()->published()->create(['user_id' => $proprietaire->id]);
        $premiere = $avecPhotos->addMedia(UploadedFile::fake()->image('a.jpg', 40, 40))->toMediaCollection('photos');
        $milieu = $avecPhotos->addMedia(UploadedFile::fake()->image('b.jpg', 40, 40))->toMediaCollection('photos');
        $derniere = $avecPhotos->addMedia(UploadedFile::fake()->image('c.jpg', 40, 40))->toMediaCollection('photos');
        // `order_column` décide, ni l'ordre d'insertion ni son contraire : celle du milieu passe devant.
        $premiere->forceFill(['order_column' => 5])->save();
        $milieu->forceFill(['order_column' => 0])->save();
        $derniere->forceFill(['order_column' => 9])->save();
        $sansConversion = Property::factory()->published()->create(['user_id' => $proprietaire->id]);
        $nue = $sansConversion->addMedia(UploadedFile::fake()->image('c.jpg', 40, 40))->toMediaCollection('photos');
        $nue->generated_conversions = [];
        $nue->save();
        $listing = $this->fiche(['phones' => [self::NUMERO]]);

        $cibles = collect($this->getJson($this->url($listing, '/matches'))->assertOk()->json('data.matches'))->keyBy('id');

        $this->assertSame($milieu->fresh()->getUrl('thumbnail'), $cibles[$avecPhotos->id]['target']['thumbnail_url']);
        $this->assertNull($cibles[$sansConversion->id]['target']['thumbnail_url']);
    }

    public function test_un_bien_non_public_est_signale_comme_tel(): void
    {
        $proprietaire = User::factory()->create(['phone' => self::NUMERO]);
        $brouillon = Property::factory()->create(['user_id' => $proprietaire->id, 'status' => 'draft']);
        $listing = $this->fiche(['phones' => [self::NUMERO]]);

        $this->getJson($this->url($listing, '/matches'))
            ->assertOk()
            ->assertJsonPath('data.matches.0.id', $brouillon->id)
            ->assertJsonPath('data.matches.0.target.status', 'draft')
            ->assertJsonPath('data.matches.0.target.is_public', false);
    }

    public function test_une_annonce_cible_porte_son_etape_et_la_premiere_photo_source_en_vignette(): void
    {
        $autre = RadarListing::factory()->extracted([
            'phones' => [self::NUMERO],
            'title' => ['value' => 'Autre annonce'],
            'price' => ['value' => 460000],
        ])->create([
            'stage' => RadarListingStage::Reviewed,
            'source_site' => RadarSourceSite::Coinafrique,
            'photo_urls' => ['https://img.example/a.jpg', 'https://img.example/b.jpg'],
        ]);
        $listing = $this->fiche(['phones' => [self::NUMERO]]);

        $this->getJson($this->url($listing, '/matches'))
            ->assertOk()
            ->assertJsonPath('data.matches.0.kind', 'listing')
            ->assertJsonPath('data.matches.0.id', $autre->id)
            ->assertJsonPath('data.matches.0.target.title', 'Autre annonce')
            ->assertJsonPath('data.matches.0.target.price', 460000)
            ->assertJsonPath('data.matches.0.target.stage', 'reviewed')
            ->assertJsonPath('data.matches.0.target.source_site', 'coinafrique')
            ->assertJsonPath('data.matches.0.target.thumbnail_url', 'https://img.example/a.jpg');
    }

    public function test_la_vignette_d_une_annonce_cible_est_sa_premiere_capture_par_url_signee(): void
    {
        $autre = RadarListing::factory()->extracted(['phones' => [self::NUMERO]])->create(['photo_urls' => ['https://img.example/a.jpg']]);
        $autre->addMedia(UploadedFile::fake()->image('capture.png', 20, 20))->toMediaCollection('radar_captures');
        $listing = $this->fiche(['phones' => [self::NUMERO]]);

        $url = $this->getJson($this->url($listing, '/matches'))->assertOk()->json('data.matches.0.target.thumbnail_url');

        $this->assertStringContainsString('/media/', $url);
        $this->assertStringContainsString('signature=', $url);
        $this->assertStringNotContainsString('img.example', $url);
    }

    public function test_une_annonce_cible_sans_photo_a_une_vignette_nulle(): void
    {
        RadarListing::factory()->extracted(['phones' => [self::NUMERO]])->create(['photo_urls' => []]);
        $listing = $this->fiche(['phones' => [self::NUMERO]]);

        $this->getJson($this->url($listing, '/matches'))->assertOk()->assertJsonPath('data.matches.0.target.thumbnail_url', null);
    }

    public function test_les_rapprochements_n_ont_pas_de_requete_par_cible(): void
    {
        $listing = $this->fiche(['phones' => [self::NUMERO]]);
        $compter = function () use ($listing): int {
            \DB::flushQueryLog();
            \DB::enableQueryLog();
            $this->getJson($this->url($listing, '/matches'))->assertOk();

            return count(\DB::getQueryLog());
        };

        $proprietaire = User::factory()->create(['phone' => self::NUMERO]);
        Property::factory()->published()->create(['user_id' => $proprietaire->id]);
        RadarListing::factory()->extracted(['phones' => [self::NUMERO]])->create();
        $une = $compter();

        Property::factory()->published()->count(6)->create(['user_id' => $proprietaire->id]);
        RadarListing::factory()->extracted(['phones' => [self::NUMERO]])->count(6)->create();
        $sept = $compter();

        $this->assertSame($une, $sept);
    }

    public function test_une_annonce_sans_empreinte_a_calculer_ne_met_rien_en_file(): void
    {
        $texte = $this->fiche(['phones' => [self::NUMERO]]);
        $calculee = $this->fiche([], [
            'source_kind' => RadarSourceKind::Url, 'photo_urls' => ['https://img.example/1.jpg'], 'source_photo_hashes' => [['rank' => 0, 'error' => 'radar.photo.unreadable']],
        ]);

        $this->getJson($this->url($texte, '/matches'))->assertOk()->assertJsonPath('data.photos.status', 'none');
        $this->getJson($this->url($calculee, '/matches'))->assertOk()->assertJsonPath('data.photos.status', 'done');

        Bus::assertNotDispatched(FingerprintRadarSourcePhotos::class);
    }

    public function test_la_fiche_rend_l_etat_des_empreintes_et_jamais_les_empreintes(): void
    {
        $listing = $this->fiche([], [
            'source_kind' => RadarSourceKind::Url,
            'photo_urls' => ['https://img.example/1.jpg', 'https://img.example/2.jpg'],
            'source_photo_hashes' => [['rank' => 0, 'hash' => 123456789, 'b0' => 1, 'b1' => 2, 'b2' => 3, 'b3' => 4]],
            'duplicate_of_listing_id' => null,
        ]);

        $reponse = $this->getJson($this->url($listing))->assertOk()
            ->assertJsonPath('data.photo_fingerprints', ['status' => 'pending', 'total' => 2, 'done' => 1])
            ->assertJsonPath('data.duplicate_of_listing_id', null)
            ->assertJsonPath('data.duplicate_of_property_id', null)
            ->assertJsonPath('data.neighborhood_link.id', $this->quartier->id);
        $this->assertStringNotContainsString('123456789', $reponse->getContent());
        $this->assertArrayNotHasKey('source_photo_hashes', $reponse->json('data'));

        // La liste ne paie pas le quartier.
        $liste = $this->getJson('/api/admin/radar/listings')->assertOk();
        $this->assertArrayNotHasKey('neighborhood_link', $liste->json('data.0'));
    }

    // --- Droits -------------------------------------------------------------------------------

    public function test_un_viewer_est_refuse_sur_les_trois_routes_et_un_support_passe(): void
    {
        $listing = $this->fiche();

        $this->agirEnOperateur(PlatformProfileLevel::Viewer);
        foreach ([
            ['patchJson', $this->url($listing), ['price' => 1]],
            ['postJson', $this->url($listing, '/review'), []],
            ['getJson', $this->url($listing, '/matches'), []],
        ] as [$verbe, $url, $corps]) {
            $this->{$verbe}($url, $corps)->assertForbidden()->assertJsonPath('code', 'platform.ability_missing');
        }
        // Un corps invalide ne renseigne pas non plus : le refus précède la validation.
        $this->patchJson($this->url($listing), [])->assertForbidden();
        $this->assertSame(RadarListingStage::Extracted, $listing->fresh()->stage);
        $this->assertSame(450000, $listing->fresh()->extracted['price']['value']);

        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->getJson($this->url($listing, '/matches'))->assertOk();
        $this->patchJson($this->url($listing), ['price' => 1])->assertOk();
        $this->postJson($this->url($listing, '/review'))->assertOk();
    }
}
