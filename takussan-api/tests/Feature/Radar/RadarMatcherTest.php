<?php

namespace Tests\Feature\Radar;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\GeoNeighborhood;
use App\Models\MediaFingerprint;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\PropertyContact;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Radar\RadarMatcher;
use App\Support\PhotoFingerprint;
use App\Support\RadarPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * TCK-2387 (ADR-0054, ADR-0077 §6) — les trois signaux de rapprochement d'une annonce lue, contre le
 * catalogue et contre les autres annonces : même téléphone, même quartier + prix + chambres, photo
 * proche. Chaque signal est éprouvé SEUL, les deux autres neutralisés.
 *
 * Neutralisation : sans téléphone (`phones` vide), sans quartier rattaché (`neighborhood_id` nul),
 * sans empreinte de photo (`source_photo_hashes` nul).
 */
class RadarMatcherTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221771234567';

    private function matcher(): RadarMatcher
    {
        return $this->app->make(RadarMatcher::class);
    }

    /** @param  array<string, mixed>  $extracted  les champs de `RadarListing::factory()->extracted()` */
    private function source(array $extracted = [], array $attributes = []): RadarListing
    {
        return RadarListing::factory()->extracted($extracted + ['phones' => []])->create($attributes);
    }

    /** @return array<string, array{kind: string, id: int, strength: string, signals: array}> */
    private function matchesOf(RadarListing $listing): array
    {
        $out = [];
        foreach ($this->matcher()->matchesFor($listing->fresh()) as $match) {
            $out[$match['kind'].':'.$match['id']] = $match;
        }

        return $out;
    }

    /** @return list<string> */
    private static function signalsOf(array $match): array
    {
        return array_column($match['signals'], 'signal');
    }

    private function quartier(array $state = []): GeoNeighborhood
    {
        return GeoNeighborhood::factory()->create($state);
    }

    private function bien(array $attributes = [], ?GeoNeighborhood $quartier = null): Property
    {
        $property = Property::factory()->published()->create($attributes + ['price' => 450000, 'bedrooms' => 3, 'contract_type' => 'rent']);
        if ($quartier !== null) {
            Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $property->id, 'geo_neighborhood_id' => $quartier->id]);
        }

        return $property;
    }

    /** Une annonce de plus qui lit ce quartier, ce prix et ces chambres. */
    private function annonceLue(?GeoNeighborhood $quartier, mixed $price = 450000, mixed $bedrooms = 3, array $extra = [], array $attributes = []): RadarListing
    {
        return RadarListing::factory()->extracted($extra + [
            'phones' => [],
            'neighborhood' => ['neighborhood_id' => $quartier?->id],
            'price' => ['value' => $price],
            'bedrooms' => ['value' => $bedrooms],
        ])->create($attributes);
    }

    private function empreinte(Property $property, int $hash): void
    {
        $media = DB::table('media')->insertGetId([
            'model_type' => Property::class, 'model_id' => $property->id, 'uuid' => (string) Str::uuid(),
            'collection_name' => 'photos', 'name' => 'p', 'file_name' => 'p.png', 'mime_type' => 'image/png', 'disk' => 'public',
            'size' => 1, 'manipulations' => '[]', 'custom_properties' => '[]', 'generated_conversions' => '[]', 'responsive_images' => '[]',
        ]);
        [$b0, $b1, $b2, $b3] = PhotoFingerprint::bands($hash);
        MediaFingerprint::query()->create(['media_id' => $media, 'property_id' => $property->id, 'hash' => $hash, 'band_0' => $b0, 'band_1' => $b1, 'band_2' => $b2, 'band_3' => $b3]);
    }

    /** Une empreinte source, avec ses bandes, telle que `SourcePhotoFingerprinter` l'écrit. */
    private static function photoSource(int $hash, string $url = 'https://cdn.test/p.jpg'): array
    {
        [$b0, $b1, $b2, $b3] = PhotoFingerprint::bands($hash);

        return ['url' => $url, 'hash' => $hash, 'b0' => $b0, 'b1' => $b1, 'b2' => $b2, 'b3' => $b3];
    }

    /** Un hash non dégénéré (pas d'aplat), déterministe. */
    private const HASH = 0x5A3C_96E1_0F2B_74D8;

    // ─── Même téléphone, contre un bien ──────────────────────────────────────────────────

    public function test_ac2_meme_telephone_qu_un_bien_publie_compte_publieur(): void
    {
        $bien = $this->bien(['user_id' => User::factory()->create(['phone' => '77 123 45 67'])->id]);
        $autre = $this->bien();
        $listing = $this->source(['phones' => [self::NUMERO]]);

        $matches = $this->matchesOf($listing);

        $this->assertSame(['property:'.$bien->id], array_keys($matches));
        $this->assertSame(['phone'], self::signalsOf($matches['property:'.$bien->id]));
        $this->assertSame('medium', $matches['property:'.$bien->id]['strength']);
        $this->assertNotContains('property:'.$autre->id, array_keys($matches));
    }

    public function test_ac2_meme_telephone_qu_un_bien_publie_numero_secondaire(): void
    {
        $bien = $this->bien(['user_id' => User::factory()->create(['secondary_phone' => '+221 77 123 45 67'])->id]);
        $listing = $this->source(['phones' => [self::NUMERO]]);

        $this->assertSame(['property:'.$bien->id], array_keys($this->matchesOf($listing)));
    }

    public function test_ac2_meme_telephone_qu_un_bien_publie_contact_sur_place(): void
    {
        $bien = $this->bien();
        PropertyContact::query()->create(['property_id' => $bien->id, 'label' => 'Gardien', 'phone' => '77-123-45-67']);
        $listing = $this->source(['phones' => [self::NUMERO]]);

        $this->assertSame(['property:'.$bien->id], array_keys($this->matchesOf($listing)));
    }

    public function test_ac2_meme_telephone_qu_un_bien_publie_agence(): void
    {
        $agence = Agency::factory()->create(['phone' => '771234567']);
        $bien = $this->bien(['agency_id' => $agence->id]);
        $listing = $this->source(['phones' => [self::NUMERO]]);

        $this->assertSame(['property:'.$bien->id], array_keys($this->matchesOf($listing)));
    }

    public function test_ac2_meme_telephone_qu_un_bien_publie_collaborateur(): void
    {
        $bien = $this->bien();
        $collaborateur = User::factory()->create(['phone' => self::NUMERO]);
        PropertyCollaborator::query()->create(['property_id' => $bien->id, 'user_id' => $collaborateur->id, 'role' => 'agent']);
        $listing = $this->source(['phones' => [self::NUMERO]]);

        $this->assertSame(['property:'.$bien->id], array_keys($this->matchesOf($listing)));
    }

    public function test_un_compte_ou_une_agence_supprimes_ne_rapprochent_plus_par_leur_numero(): void
    {
        $listing = $this->source(['phones' => [self::NUMERO]]);

        $publieur = User::factory()->create(['phone' => self::NUMERO]);
        $secondaire = User::factory()->create(['secondary_phone' => self::NUMERO]);
        $collaborateur = User::factory()->create(['phone' => self::NUMERO]);
        $agence = Agency::factory()->create(['phone' => self::NUMERO]);
        $parPublieur = $this->bien(['user_id' => $publieur->id]);
        $parSecondaire = $this->bien(['user_id' => $secondaire->id]);
        $parCollaborateur = $this->bien();
        PropertyCollaborator::query()->create(['property_id' => $parCollaborateur->id, 'user_id' => $collaborateur->id, 'role' => 'agent']);
        $parAgence = $this->bien(['agency_id' => $agence->id]);
        $tous = ['property:'.$parPublieur->id, 'property:'.$parSecondaire->id, 'property:'.$parCollaborateur->id, 'property:'.$parAgence->id];

        $this->assertEqualsCanonicalizing($tous, array_keys($this->matchesOf($listing)), 'témoin : vivants, ils rapprochent');

        foreach ([$publieur, $secondaire, $collaborateur, $agence] as $supprime) {
            $supprime->delete();
        }

        $this->assertSame([], array_keys($this->matchesOf($listing)));
    }

    public function test_le_numero_de_l_annonceur_compte_et_les_numeros_ecartes_non(): void
    {
        $bienAnnonceur = $this->bien(['user_id' => User::factory()->create(['phone' => self::NUMERO])->id]);
        $bienEcarte = $this->bien(['user_id' => User::factory()->create(['phone' => '+221789998877'])->id]);
        $annonceur = RadarAdvertiser::factory()->create(['phone' => self::NUMERO]);
        $listing = $this->source(['phones_dropped' => ['+221789998877']], ['radar_advertiser_id' => $annonceur->id]);

        $this->assertSame(['property:'.$bienAnnonceur->id], array_keys($this->matchesOf($listing)));
        $this->assertNotContains('property:'.$bienEcarte->id, array_keys($this->matchesOf($listing)));
    }

    public function test_un_proprietaire_sans_numero_ne_rapproche_rien(): void
    {
        $this->bien(['user_id' => User::factory()->create(['phone' => null])->id]);
        $listing = $this->source(['phones' => []]);

        $this->assertSame([], $this->matchesOf($listing));
    }

    // ─── Même téléphone, contre une autre annonce ────────────────────────────────────────

    public function test_meme_telephone_qu_une_autre_annonce_par_l_annonceur(): void
    {
        $annonceur = RadarAdvertiser::factory()->create(['phone' => self::NUMERO]);
        $autre = $this->annonceLue(null, extra: [], attributes: ['radar_advertiser_id' => $annonceur->id]);
        $sansRapport = $this->annonceLue(null);
        $listing = $this->source(['phones' => [self::NUMERO]]);

        $matches = $this->matchesOf($listing);

        $this->assertSame(['listing:'.$autre->id], array_keys($matches));
        $this->assertSame(['phone'], self::signalsOf($matches['listing:'.$autre->id]));
        $this->assertSame('medium', $matches['listing:'.$autre->id]['strength']);
        $this->assertNotContains('listing:'.$sansRapport->id, array_keys($matches));
    }

    public function test_meme_telephone_qu_une_autre_annonce_par_ses_numeros_extraits(): void
    {
        $autre = $this->annonceLue(null, extra: ['phones' => [self::NUMERO, '+221781112233']]);
        $listing = $this->source(['phones' => [self::NUMERO]]);

        $this->assertSame(['listing:'.$autre->id], array_keys($this->matchesOf($listing)));
    }

    public function test_un_annonceur_stop_au_numero_purge_se_retrouve_par_son_empreinte(): void
    {
        $stop = RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac(self::NUMERO)]);
        // Une annonce STOP ne garde pas sa lecture : `extracted` est nul.
        $autre = RadarListing::factory()->create(['radar_advertiser_id' => $stop->id, 'stage' => RadarListingStage::DoNotContact]);
        $listing = $this->source(['phones' => [self::NUMERO]]);

        $this->assertSame(['listing:'.$autre->id], array_keys($this->matchesOf($listing)));
    }

    public function test_les_numeros_ecartes_ne_rapprochent_pas_les_annonces(): void
    {
        $this->annonceLue(null, extra: ['phones' => ['+221789998877']]);
        $listing = $this->source(['phones' => [], 'phones_dropped' => ['+221789998877']]);

        $this->assertSame([], $this->matchesOf($listing));
    }

    // ─── Même quartier, prix à ±10 %, mêmes chambres ─────────────────────────────────────

    public function test_ac2_meme_quartier_prix_a_dix_pour_cent_et_memes_chambres_qu_un_bien_publie(): void
    {
        $q = $this->quartier();
        $listing = $this->source(['neighborhood' => ['neighborhood_id' => $q->id], 'price' => ['value' => 450000], 'bedrooms' => ['value' => 3]]);
        $pile = $this->bien(['price' => 495000], $q); // +10 % pile : inclus
        $bas = $this->bien(['price' => 405000], $q); // −10 % pile : inclus
        $trop = $this->bien(['price' => 495500], $q); // +10,1 % : exclu
        $memePrix = $this->bien(['price' => 450000], $q);

        $matches = $this->matchesOf($listing);

        $this->assertEqualsCanonicalizing(['property:'.$pile->id, 'property:'.$bas->id, 'property:'.$memePrix->id], array_keys($matches));
        $this->assertNotContains('property:'.$trop->id, array_keys($matches));
        $this->assertSame('low', $matches['property:'.$pile->id]['strength']);
        $this->assertSame('medium', $matches['property:'.$memePrix->id]['strength']);
        $this->assertSame(0.0, (float) $matches['property:'.$memePrix->id]['signals'][0]['price_gap']);
        $this->assertEqualsWithDelta(0.1, $matches['property:'.$pile->id]['signals'][0]['price_gap'], 0.0001);
        $this->assertSame('neighborhood_price_bedrooms', $matches['property:'.$memePrix->id]['signals'][0]['signal']);
    }

    public function test_un_bien_a_deux_adresses_du_quartier_n_a_qu_un_signal_de_lieu_et_reste_medium(): void
    {
        $q = $this->quartier();
        $listing = $this->source(['neighborhood' => ['neighborhood_id' => $q->id]]);
        $bien = $this->bien(['price' => 450000], $q);
        // `addresses` n'est pas unique par bien : la seconde ne doit pas doubler le signal (un faux `high`).
        Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'geo_neighborhood_id' => $q->id]);

        $matches = $this->matchesOf($listing);

        $this->assertSame(['neighborhood_price_bedrooms'], self::signalsOf($matches['property:'.$bien->id]));
        $this->assertSame('medium', $matches['property:'.$bien->id]['strength']);
    }

    public function test_les_adresses_en_double_d_un_bien_ne_prennent_pas_la_place_des_autres_cibles(): void
    {
        $q = $this->quartier();
        $listing = $this->source(['neighborhood' => ['neighborhood_id' => $q->id]]);
        $ancien = $this->bien(['price' => 450000], $q);
        $recent = $this->bien(['price' => 450000], $q);
        // Plus d'adresses que de places : une jointure remplirait tout le plafond avec le même bien.
        Address::factory()->count(RadarMatcher::MAX_PER_SIGNAL + 1)->create(['addressable_type' => Property::class, 'addressable_id' => $recent->id, 'geo_neighborhood_id' => $q->id]);

        $this->assertEqualsCanonicalizing(['property:'.$ancien->id, 'property:'.$recent->id], array_keys($this->matchesOf($listing)));
    }

    public function test_un_ecart_de_prix_de_trois_pour_cent_reste_medium_et_au_dela_low(): void
    {
        $q = $this->quartier();
        $listing = $this->source(['neighborhood' => ['neighborhood_id' => $q->id]]);
        $trois = $this->bien(['price' => 463500], $q); // +3 %
        $quatre = $this->bien(['price' => 468000], $q); // +4 %

        $matches = $this->matchesOf($listing);

        $this->assertSame('medium', $matches['property:'.$trois->id]['strength']);
        $this->assertSame('low', $matches['property:'.$quatre->id]['strength']);
    }

    public function test_le_quartier_le_prix_et_les_chambres_sont_tous_exiges(): void
    {
        $q = $this->quartier();
        $autreQuartier = $this->quartier();
        $this->bien(['bedrooms' => 2], $q);
        $this->bien([], $autreQuartier);
        $this->bien(['contract_type' => 'sale'], $q);
        $this->bien([], null); // sans adresse
        $listing = $this->source(['neighborhood' => ['neighborhood_id' => $q->id]]);

        $this->assertSame([], $this->matchesOf($listing), 'chambres, quartier, contrat et adresse : chacun fait tomber le signal');
    }

    public function test_sans_l_une_des_trois_valeurs_l_annonce_ne_porte_pas_le_signal(): void
    {
        $q = $this->quartier();
        $this->bien([], $q);

        foreach ([
            ['neighborhood' => ['neighborhood_id' => null]],
            ['neighborhood' => ['neighborhood_id' => $q->id], 'price' => ['value' => null]],
            ['neighborhood' => ['neighborhood_id' => $q->id], 'bedrooms' => ['value' => null]],
        ] as $extracted) {
            $this->assertSame([], $this->matchesOf($this->source($extracted)));
        }
    }

    public function test_un_contrat_inconnu_de_l_annonce_ne_filtre_pas_le_contrat(): void
    {
        $q = $this->quartier();
        $vente = $this->bien(['contract_type' => 'sale'], $q);
        $listing = $this->source(['neighborhood' => ['neighborhood_id' => $q->id], 'contract' => ['value' => null]]);

        $this->assertSame(['property:'.$vente->id], array_keys($this->matchesOf($listing)));
    }

    public function test_un_quartier_fusionne_dans_celui_de_l_annonce_est_trouve(): void
    {
        $cible = $this->quartier();
        $fusionne = $this->quartier(['merged_into_id' => $cible->id]);
        $bien = $this->bien([], $fusionne);
        $listing = $this->source(['neighborhood' => ['neighborhood_id' => $cible->id]]);

        $this->assertSame(['property:'.$bien->id], array_keys($this->matchesOf($listing)));
    }

    public function test_meme_quartier_prix_et_chambres_qu_une_autre_annonce(): void
    {
        $q = $this->quartier();
        $fusionne = $this->quartier(['merged_into_id' => $q->id]);
        $listing = $this->source(['neighborhood' => ['neighborhood_id' => $q->id]]);
        $proche = $this->annonceLue($q, 460000);
        $dansFusionne = $this->annonceLue($fusionne, 450000);
        $loin = $this->annonceLue($q, 600000);
        $autresChambres = $this->annonceLue($q, 450000, 2);
        $autreQuartier = $this->annonceLue($this->quartier(), 450000);
        $autreContrat = $this->annonceLue($q, 450000, 3, ['contract' => ['value' => 'sale']]);

        $matches = $this->matchesOf($listing);

        $this->assertEqualsCanonicalizing(['listing:'.$proche->id, 'listing:'.$dansFusionne->id], array_keys($matches));
        $this->assertSame('medium', $matches['listing:'.$proche->id]['strength']); // 2,2 %
        foreach ([$loin, $autresChambres, $autreQuartier, $autreContrat] as $exclue) {
            $this->assertNotContains('listing:'.$exclue->id, array_keys($matches));
        }
    }

    public function test_une_annonce_corrigee_par_l_operateur_se_lit_corrigee(): void
    {
        $q = $this->quartier();
        $listing = $this->source(['neighborhood' => ['neighborhood_id' => $q->id]]);
        // L'opérateur corrige le prix de l'AUTRE annonce : 700 000 -> 455 000.
        $corrigee = $this->annonceLue($q, 455000);
        $extracted = $corrigee->extracted;
        $extracted['price'] = ['value' => 455000, 'corrected' => true, 'confidence' => 'low', 'evidence' => null, 'flags' => []];
        $corrigee->update(['extracted' => $extracted]);

        $this->assertSame(['listing:'.$corrigee->id], array_keys($this->matchesOf($listing)));
    }

    public function test_un_extracted_dont_le_prix_est_une_chaine_ne_fait_pas_lever_la_requete(): void
    {
        $q = $this->quartier();
        $listing = $this->source(['neighborhood' => ['neighborhood_id' => $q->id]]);
        $this->annonceLue($q, 'cher');
        $this->annonceLue($q, 450000, 'trois');
        $this->annonceLue($q, ['x' => 1], null);
        $valide = $this->annonceLue($q, 450000);
        // Un quartier qui n'est pas un nombre.
        RadarListing::factory()->extracted(['phones' => [], 'neighborhood' => ['neighborhood_id' => 'Mermoz']])->create();

        $this->assertSame(['listing:'.$valide->id], array_keys($this->matchesOf($listing)));
    }

    // ─── Photo proche (dHash) ────────────────────────────────────────────────────────────

    public function test_ac3_une_photo_source_proche_d_une_photo_de_bien_est_signalee(): void
    {
        $proche = $this->bien();
        $this->empreinte($proche, self::HASH ^ 0b101); // distance 2
        $tresProche = $this->bien();
        $this->empreinte($tresProche, self::HASH ^ 0b1); // distance 1
        $loin = $this->bien();
        $this->empreinte($loin, self::HASH ^ 0b11110); // distance 4
        $listing = $this->source([], ['source_kind' => RadarSourceKind::Url, 'photo_urls' => ['https://cdn.test/p.jpg'], 'source_photo_hashes' => [self::photoSource(self::HASH)]]);

        $matches = $this->matchesOf($listing);

        $this->assertEqualsCanonicalizing(['property:'.$proche->id, 'property:'.$tresProche->id], array_keys($matches));
        $this->assertSame([['signal' => 'photo', 'strength' => 'medium', 'distance' => 2]], $matches['property:'.$proche->id]['signals']);
        $this->assertSame([['signal' => 'photo', 'strength' => 'high', 'distance' => 1]], $matches['property:'.$tresProche->id]['signals']);
        $this->assertSame('high', $matches['property:'.$tresProche->id]['strength']);
    }

    public function test_une_empreinte_degeneree_ne_rapproche_rien(): void
    {
        $bien = $this->bien();
        $this->empreinte($bien, 0);
        $listing = $this->source([], ['source_photo_hashes' => [self::photoSource(0), self::photoSource(-1)]]);

        $this->assertSame([], $this->matchesOf($listing));
    }

    public function test_une_photo_refusee_ou_sans_empreinte_ne_rapproche_rien(): void
    {
        $bien = $this->bien();
        $this->empreinte($bien, self::HASH);
        $listing = $this->source([], ['source_photo_hashes' => [['url' => 'u', 'hash' => null, 'error' => 'radar.fetch.timeout']]]);

        $this->assertSame([], $this->matchesOf($listing));
        $this->assertSame([], $this->matchesOf($this->source()), 'null : jamais calculé');
    }

    public function test_une_photo_source_proche_d_une_autre_annonce_est_signalee(): void
    {
        $proche = $this->annonceLue(null, attributes: ['source_photo_hashes' => [self::photoSource(0x1111_2222_3333_4444), self::photoSource(self::HASH ^ 0b11, 'https://cdn.test/q.jpg')]]);
        $loin = $this->annonceLue(null, attributes: ['source_photo_hashes' => [self::photoSource(self::HASH ^ 0b11110)]]);
        $degeneree = $this->annonceLue(null, attributes: ['source_photo_hashes' => [self::photoSource(0)]]);
        $listing = $this->source([], ['source_photo_hashes' => [self::photoSource(self::HASH)]]);

        $matches = $this->matchesOf($listing);

        $this->assertSame(['listing:'.$proche->id], array_keys($matches));
        $this->assertSame([['signal' => 'photo', 'strength' => 'medium', 'distance' => 2]], $matches['listing:'.$proche->id]['signals']);
        $this->assertNotContains('listing:'.$loin->id, array_keys($matches));
        $this->assertNotContains('listing:'.$degeneree->id, array_keys($matches));
    }

    public function test_une_photo_proche_qui_ne_partage_aucune_bande_est_hors_de_portee_par_construction(): void
    {
        // Distance 4 en retournant un bit dans chacune des quatre bandes : aucune bande commune,
        // et la distance dépasse de toute façon le seuil de 3 (principe des tiroirs, ADR-0054).
        $autre = $this->annonceLue(null, attributes: ['source_photo_hashes' => [self::photoSource(self::HASH ^ 0x0001_0001_0001_0001)]]);
        $listing = $this->source([], ['source_photo_hashes' => [self::photoSource(self::HASH)]]);

        $this->assertNotContains('listing:'.$autre->id, array_keys($this->matchesOf($listing)));
    }

    // ─── Exclusions ──────────────────────────────────────────────────────────────────────

    public function test_l_annonce_elle_meme_les_purgees_les_biens_de_test_et_supprimes_sont_exclus(): void
    {
        $q = $this->quartier();
        $listing = $this->source(['phones' => [self::NUMERO], 'neighborhood' => ['neighborhood_id' => $q->id]]);
        $listing->update(['source_photo_hashes' => [self::photoSource(self::HASH)]]);

        $this->annonceLue($q, 450000, 3, ['phones' => [self::NUMERO]], ['stage' => RadarListingStage::Purged]);
        $test = $this->bien(['is_test' => true, 'user_id' => User::factory()->create(['phone' => self::NUMERO])->id], $q);
        $this->empreinte($test, self::HASH);
        $supprime = $this->bien(['user_id' => User::factory()->create(['phone' => self::NUMERO])->id], $q);
        $this->empreinte($supprime, self::HASH);
        $supprime->delete();

        $this->assertSame([], $this->matchesOf($listing), 'ni soi, ni purgée, ni bien de test, ni bien supprimé');
    }

    public function test_un_bien_de_tout_statut_est_rapproche(): void
    {
        $q = $this->quartier();
        $brouillon = Property::factory()->draft()->create(['price' => 450000, 'bedrooms' => 3, 'contract_type' => 'rent']);
        Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $brouillon->id, 'geo_neighborhood_id' => $q->id]);
        $listing = $this->source(['neighborhood' => ['neighborhood_id' => $q->id]]);

        $this->assertSame(['property:'.$brouillon->id], array_keys($this->matchesOf($listing)));
    }

    // ─── Agrégation et tri ───────────────────────────────────────────────────────────────

    public function test_telephone_et_photo_sur_le_meme_bien_donnent_une_entree_high_a_deux_signaux(): void
    {
        $bien = $this->bien(['user_id' => User::factory()->create(['phone' => self::NUMERO])->id]);
        $this->empreinte($bien, self::HASH ^ 0b101); // photo : medium
        $listing = $this->source(['phones' => [self::NUMERO]], ['source_photo_hashes' => [self::photoSource(self::HASH)]]);

        $matches = $this->matchesOf($listing);

        $this->assertSame(['property:'.$bien->id], array_keys($matches));
        $this->assertEqualsCanonicalizing(['phone', 'photo'], self::signalsOf($matches['property:'.$bien->id]));
        $this->assertSame('high', $matches['property:'.$bien->id]['strength'], 'deux signaux distincts : high, même si chacun est medium');
    }

    public function test_le_tri_est_force_puis_nombre_de_signaux_puis_biens_avant_annonces_puis_id_decroissant(): void
    {
        $q = $this->quartier();
        $deuxSignaux = $this->bien(['user_id' => User::factory()->create(['phone' => self::NUMERO])->id], $q); // phone + lieu : high
        $photoProche = $this->bien();
        $this->empreinte($photoProche, self::HASH ^ 1); // photo high, un signal
        $bienMedium1 = $this->bien(['user_id' => User::factory()->create(['phone' => self::NUMERO])->id]);
        $bienMedium2 = $this->bien(['user_id' => User::factory()->create(['phone' => self::NUMERO])->id]);
        $annonceMedium = $this->annonceLue(null, extra: ['phones' => [self::NUMERO]]);
        $bienLow = $this->bien(['price' => 495000], $q);
        $listing = $this->source(
            ['phones' => [self::NUMERO], 'neighborhood' => ['neighborhood_id' => $q->id]],
            ['source_photo_hashes' => [self::photoSource(self::HASH)]],
        );

        $ordre = array_keys($this->matchesOf($listing));

        $this->assertSame([
            'property:'.$deuxSignaux->id, // high, deux signaux
            'property:'.$photoProche->id, // high, un signal
            'property:'.max($bienMedium1->id, $bienMedium2->id), // medium : biens avant annonces, id décroissant
            'property:'.min($bienMedium1->id, $bienMedium2->id),
            'listing:'.$annonceMedium->id,
        ], array_slice($ordre, 0, 5));
        $this->assertContains('property:'.$bienLow->id, $ordre);
        $this->assertSame('property:'.$bienLow->id, end($ordre), 'low en dernier');
    }

    public function test_au_plus_vingt_cibles_par_signal(): void
    {
        $owner = User::factory()->create(['phone' => self::NUMERO]);
        for ($i = 0; $i < 25; $i++) {
            $this->bien(['user_id' => $owner->id]);
        }
        $listing = $this->source(['phones' => [self::NUMERO]]);

        $this->assertCount(RadarMatcher::MAX_PER_SIGNAL, $this->matcher()->matchesFor($listing));
    }

    public function test_les_vingt_gardes_sont_les_plus_recents(): void
    {
        $owner = User::factory()->create(['phone' => self::NUMERO]);
        $ids = [];
        for ($i = 0; $i < 22; $i++) {
            $ids[] = $this->bien(['user_id' => $owner->id])->id;
        }
        $listing = $this->source(['phones' => [self::NUMERO]]);

        $gardes = array_column($this->matcher()->matchesFor($listing), 'id');

        $this->assertEqualsCanonicalizing(array_slice($ids, 2), $gardes);
    }

    // ─── Nombre de requêtes ──────────────────────────────────────────────────────────────

    /** @return int le nombre de requêtes de `matchesFor()`, en regard de `$cibles` cibles par signal */
    private function requetes(int $cibles): int
    {
        $q = $this->quartier();
        $owner = User::factory()->create(['phone' => self::NUMERO]);
        for ($i = 0; $i < $cibles; $i++) {
            $bien = $this->bien(['user_id' => $owner->id], $q);
            $this->empreinte($bien, self::HASH ^ 1);
            $this->annonceLue($q, 450000, 3, ['phones' => [self::NUMERO]], ['source_photo_hashes' => [self::photoSource(self::HASH ^ 1)]]);
        }
        $listing = $this->source(
            ['phones' => [self::NUMERO], 'neighborhood' => ['neighborhood_id' => $q->id]],
            ['source_photo_hashes' => [self::photoSource(self::HASH), self::photoSource(self::HASH ^ 0b1000_0000, 'https://cdn.test/2.jpg')]],
        )->fresh();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $count = count($this->matcher()->matchesFor($listing));
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();
        $this->assertGreaterThan(0, $count);

        return $queries;
    }

    public function test_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_cibles(): void
    {
        $peu = $this->requetes(1);
        $beaucoup = $this->requetes(12);

        $this->assertSame($peu, $beaucoup, 'le nombre de requêtes est celui des signaux et des photos, jamais des cibles');
        $this->assertLessThanOrEqual(12, $beaucoup);
    }
}
