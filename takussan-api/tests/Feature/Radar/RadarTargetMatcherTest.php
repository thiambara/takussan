<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceSite;
use App\Models\Enums\RadarTargetOrigin;
use App\Models\Enums\RadarTargetStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\RadarListing;
use App\Models\RadarTarget;
use App\Services\Radar\Crawl\ListCard;
use App\Services\Radar\Targets\InvalidRadarTargetCriteria;
use App\Services\Radar\Targets\RadarTargetCriteria;
use App\Services\Radar\Targets\RadarTargetLinker;
use App\Services\Radar\Targets\RadarTargetMatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * TCK-2468 (ADR-0087 §5) — une carte face aux cibles (PERMISSIF : une valeur absente n'exclut rien), une annonce extraite
 * face aux cibles (STRICT : un critère posé exige une valeur connue), le quartier comparé par la clé du référentiel
 * (casse repliée hors ASCII), et les critères jugés par `RadarTargetCriteria`.
 */
class RadarTargetMatcherTest extends TestCase
{
    use RefreshDatabase;

    private RadarTargetMatcher $matcher;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeSecond();
        $this->matcher = app(RadarTargetMatcher::class);
    }

    /** @param  array<string, mixed>  $criteria */
    private function target(array $criteria, RadarTargetStatus $status = RadarTargetStatus::Active): RadarTarget
    {
        $normalized = RadarTargetCriteria::normalize($criteria);

        return RadarTarget::query()->create([
            'name' => 'Cible '.Str::random(4), 'origin' => RadarTargetOrigin::Operator, 'status' => $status,
            'criteria' => $normalized, 'criteria_signature' => RadarTargetCriteria::signature($normalized),
        ]);
    }

    /** @param  array<string, mixed>  $criteria */
    private function card(ListCard $card, array $criteria): bool
    {
        return $this->matcher->cardMayMatch($card, RadarTargetCriteria::normalize($criteria));
    }

    /**
     * Une annonce extraite : chaque champ sous la forme `{value, confidence, evidence, flags}` de l'extraction.
     *
     * @param  array<string, mixed>  $values
     */
    private function listing(array $values, ?int $neighborhoodId = null, RadarSourceSite $site = RadarSourceSite::ExpatDakar): RadarListing
    {
        $extracted = [];
        foreach (['property_type', 'contract', 'rent_period', 'price', 'neighborhood', 'city', 'bedrooms', 'furnished'] as $field) {
            $extracted[$field] = ['value' => $values[$field] ?? null, 'confidence' => 'high', 'evidence' => null, 'flags' => []];
        }
        $extracted['neighborhood'] += ['neighborhood_id' => $neighborhoodId, 'suggestions' => []];

        return RadarListing::factory()->create([
            'source_site' => $site, 'stage' => RadarListingStage::Captured, 'extracted' => $extracted,
        ]);
    }

    private function city(string $name): GeoCity
    {
        return GeoCity::factory()->create(['name' => $name, 'slug' => Str::slug($name).'-'.Str::random(4)]);
    }

    private function quartier(GeoCity $city, string $name): GeoNeighborhood
    {
        return GeoNeighborhood::factory()->create(['geo_city_id' => $city->id, 'name' => $name, 'slug' => Str::slug($name).'-'.Str::random(4)]);
    }

    // ── La carte : permissive ─────────────────────────────────────────────────────────────────

    public function test_une_valeur_absente_de_la_carte_ne_l_exclut_pas(): void
    {
        $criteria = ['types' => ['apartment'], 'contract' => 'rent', 'price_min' => 300_000, 'price_max' => 700_000, 'bedrooms_min' => 2,
            'neighborhoods' => [['name' => 'Almadies', 'city' => 'Dakar']], 'furnished' => true, 'max_age_days' => 7];

        $this->assertTrue($this->card(new ListCard('https://x.test/a'), $criteria), 'Une carte muette peut correspondre.');
        $this->assertTrue($this->card(new ListCard('https://x.test/a', propertyType: 'apartment', contract: 'rent'), $criteria));
    }

    public function test_une_valeur_lue_qui_contredit_un_critere_exclut_la_carte(): void
    {
        $criteria = ['types' => ['apartment'], 'contract' => 'rent', 'price_max' => 700_000, 'bedrooms_min' => 2];

        $this->assertFalse($this->card(new ListCard('https://x.test/a', propertyType: 'villa'), $criteria));
        $this->assertFalse($this->card(new ListCard('https://x.test/a', contract: 'sale'), $criteria));
        $this->assertFalse($this->card(new ListCard('https://x.test/a', price: 900_000), $criteria));
        $this->assertFalse($this->card(new ListCard('https://x.test/a', bedrooms: 1), $criteria));
        // Un loyer à la journée ne se compare pas à une fourchette mensuelle : il n'exclut pas.
        $this->assertTrue($this->card(new ListCard('https://x.test/a', price: 900_000, rentPeriod: 'daily'), $criteria));
    }

    public function test_le_lieu_d_une_carte_ne_l_exclut_que_s_il_nomme_un_autre_quartier_du_referentiel(): void
    {
        $dakar = $this->city('Dakar');
        $this->quartier($dakar, 'Almadies');
        $this->quartier($dakar, 'Mermoz');
        $criteria = ['neighborhoods' => [['name' => 'Almadies', 'city' => 'Dakar']]];

        $this->assertTrue($this->card(new ListCard('https://x.test/a', location: 'Almadies, Dakar'), $criteria));
        $this->assertTrue($this->card(new ListCard('https://x.test/a', location: 'ALMADIES'), $criteria));
        $this->assertTrue($this->card(new ListCard('https://x.test/a', location: 'Dakar'), $criteria), 'La ville seule ne dit pas le quartier.');
        $this->assertTrue($this->card(new ListCard('https://x.test/a', location: 'Quelque part'), $criteria), 'Un lieu inconnu du référentiel n\'exclut rien.');
        $this->assertFalse($this->card(new ListCard('https://x.test/a', location: 'Mermoz, Dakar'), $criteria));
    }

    public function test_une_carte_est_saisie_si_une_seule_cible_active_du_site_peut_la_vouloir(): void
    {
        $this->target(['contract' => 'sale']);
        $this->target(['contract' => 'rent'], RadarTargetStatus::Paused);
        $this->target(['contract' => 'rent', 'sites' => ['coinafrique']]);
        $card = new ListCard('https://x.test/a', contract: 'rent');

        $this->assertFalse($this->matcher->mayMatchCard($card, RadarSourceSite::ExpatDakar));
        $this->assertTrue($this->matcher->mayMatchCard($card, RadarSourceSite::Coinafrique));
    }

    // ── L'annonce extraite : stricte ──────────────────────────────────────────────────────────

    public function test_apres_extraction_un_critere_pose_exige_une_valeur_connue(): void
    {
        $target = $this->target(['types' => ['apartment'], 'contract' => 'rent', 'price_max' => 700_000]);

        $sansPrix = $this->listing(['property_type' => 'apartment', 'contract' => 'rent']);
        $dansLaFourchette = $this->listing(['property_type' => 'apartment', 'contract' => 'rent', 'price' => 450_000, 'rent_period' => 'monthly']);
        $alaJournee = $this->listing(['property_type' => 'apartment', 'contract' => 'rent', 'price' => 50_000, 'rent_period' => 'daily']);

        $this->assertSame([], $this->matcher->matchingTargets($sansPrix)->pluck('id')->all(), 'Strict : un prix inconnu ne remplit pas une fourchette.');
        $this->assertSame([$target->id], $this->matcher->matchingTargets($dansLaFourchette)->pluck('id')->all());
        $this->assertSame([], $this->matcher->matchingTargets($alaJournee)->pluck('id')->all());
    }

    public function test_le_quartier_se_compare_par_la_cle_du_referentiel_casse_icu_comprise(): void
    {
        $dakar = $this->city('Dakar');
        $medina = $this->quartier($dakar, 'Médina');
        $target = $this->target(['neighborhoods' => [['name' => 'MÉDINA', 'city' => 'dakar']]]);

        // Rattachée au référentiel : le nom du quartier et de sa ville font foi.
        $this->assertSame([$target->id], $this->matcher->matchingTargets($this->listing([], $medina->id))->pluck('id')->all());
        // Non rattachée : le texte lu, replié hors ASCII (`strtolower('MÉDINA')` rendrait « mÉdina »).
        $this->assertSame([$target->id], $this->matcher->matchingTargets($this->listing(['neighborhood' => 'médina', 'city' => 'Dakar']))->pluck('id')->all());
        // Les accents restent distincts (ADR-0062 §1), et une autre ville départage.
        $this->assertSame([], $this->matcher->matchingTargets($this->listing(['neighborhood' => 'Medina', 'city' => 'Dakar']))->pluck('id')->all());
        $this->assertSame([], $this->matcher->matchingTargets($this->listing(['neighborhood' => 'Médina', 'city' => 'Thiès']))->pluck('id')->all());
    }

    public function test_le_rattachement_suit_les_cibles_actives_et_recompte(): void
    {
        $loyer = $this->target(['contract' => 'rent']);
        $vente = $this->target(['contract' => 'sale']);
        $pause = $this->target(['types' => ['apartment']], RadarTargetStatus::Paused);
        $listing = $this->listing(['property_type' => 'apartment', 'contract' => 'rent']);
        $listing->forceFill(['stage' => RadarListingStage::Extracted])->save();

        $this->assertSame([$loyer->id], $listing->targets()->pluck('radar_targets.id')->all(), 'L\'observateur rattache à l\'entrée en `extracted`.');
        $this->assertSame(1, $loyer->fresh()->matches_count);
        $this->assertTrue($loyer->fresh()->last_matched_at->equalTo(now()));
        $this->assertSame(0, $vente->fresh()->matches_count);
        $this->assertSame(0, $pause->fresh()->matches_count);

        // La relecture corrige le contrat : le lien vers la cible qui ne correspond plus tombe, l'autre se pose.
        $extracted = $listing->extracted;
        $extracted['contract']['value'] = 'sale';
        $listing->forceFill(['extracted' => $extracted, 'stage' => RadarListingStage::Reviewed])->save();

        $this->assertSame([$vente->id], $listing->targets()->pluck('radar_targets.id')->all());
        $this->assertSame(0, $loyer->fresh()->matches_count);
        $this->assertSame(1, $vente->fresh()->matches_count);
        $this->assertSame([], app(RadarTargetLinker::class)->link($listing->fresh()), 'Rejouer ne rattache rien de plus.');
        $this->assertSame(1, $vente->fresh()->matches_count);
    }

    // ── Les critères ──────────────────────────────────────────────────────────────────────────

    public function test_les_criteres_sont_normalises_et_leur_empreinte_ignore_casse_et_ordre(): void
    {
        $a = RadarTargetCriteria::normalize(['cities' => ['Dakar', 'dakar'], 'types' => ['villa', 'apartment'], 'price_max' => '700000']);
        $b = RadarTargetCriteria::normalize(['types' => ['apartment', 'villa'], 'cities' => ['DAKAR'], 'price_max' => 700000]);

        $this->assertSame(['Dakar'], $a['cities']);
        $this->assertSame(['apartment', 'villa'], $a['types']);
        $this->assertSame(700_000, $a['price_max']);
        $this->assertSame(RadarTargetCriteria::KEYS, array_keys($a));
        $this->assertSame(RadarTargetCriteria::signature($a), RadarTargetCriteria::signature($b));
        $this->assertNotSame(RadarTargetCriteria::signature($a), RadarTargetCriteria::signature(RadarTargetCriteria::normalize(['cities' => ['Dakar']])));
    }

    public function test_des_criteres_invalides_sont_refuses_avec_leur_code(): void
    {
        $cases = [
            'radar.targets.empty_criteria' => [],
            'radar.targets.unknown_criterion' => ['surface_min' => 10],
            'radar.targets.invalid_range' => ['price_min' => 800_000, 'price_max' => 700_000],
            'radar.targets.invalid_criteria' => ['types' => ['chateau']],
        ];
        foreach ($cases as $code => $criteria) {
            try {
                RadarTargetCriteria::normalize($criteria);
                $this->fail("Accepté : {$code}");
            } catch (InvalidRadarTargetCriteria $e) {
                $this->assertSame($code, $e->errorCode);
            }
        }
        foreach ([['contract' => 'lease'], ['price_min' => -1], ['sites' => ['leboncoin']], ['bedrooms_max' => 99], ['furnished' => 'oui']] as $criteria) {
            try {
                RadarTargetCriteria::normalize($criteria);
                $this->fail('Accepté : '.json_encode($criteria));
            } catch (InvalidRadarTargetCriteria $e) {
                $this->assertSame('radar.targets.invalid_criteria', $e->errorCode);
            }
        }
    }
}
