<?php

namespace Tests\Feature\Radar\Observatory;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceSite;
use App\Models\GeoNeighborhood;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Support\RadarPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2393 (ADR-0083 §5) — AC5 : le classement des annonceurs trie par volume, sans les doublons ni les annonces purgées ;
 * il rend quartiers, gammes de prix et sites, et la piste commerciale jusqu'à la demande de passage en agence.
 */
class RadarAdvertiserRankingTest extends TestCase
{
    use ConstruitLeMarche;
    use OperateursPlateforme;
    use RefreshDatabase;

    private const ROUTE = '/api/admin/radar/observatory/advertisers';

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        $this->travelTo('2026-10-30 12:00:00');
        Queue::fake();
    }

    private function annonceur(string $suffixe, array $surcharge = []): RadarAdvertiser
    {
        $numero = '+22174000'.$suffixe;

        return RadarAdvertiser::query()->create($surcharge + [
            'phone' => $numero,
            'phone_hmac' => RadarPhone::hmac($numero),
            'display_name' => 'Annonceur '.$suffixe,
            'nature' => RadarAdvertiserNature::Unknown,
        ]);
    }

    /** @param  array<string, mixed>  $surcharge */
    private function annonces(RadarAdvertiser $annonceur, int $n, array $surcharge = []): void
    {
        for ($i = 0; $i < $n; $i++) {
            RadarListing::factory()->create($surcharge + ['radar_advertiser_id' => $annonceur->id]);
        }
    }

    public function test_le_classement_trie_par_volume_sans_doublons_ni_purgees(): void
    {
        $petit = $this->annonceur('0001');
        $this->annonces($petit, 2);
        $gros = $this->annonceur('0002', ['nature' => RadarAdvertiserNature::Agency]);
        $this->annonces($gros, 3);
        // Ni les doublons ni les annonces purgées ne font le volume.
        $this->annonces($petit, 4, ['stage' => RadarListingStage::Purged]);
        $original = RadarListing::query()->where('radar_advertiser_id', $gros->id)->first();
        $this->annonces($petit, 3, ['stage' => RadarListingStage::Duplicate, 'duplicate_of_listing_id' => $original->id]);
        // Un annonceur sans annonce vivante n'est pas classé.
        $vide = $this->annonceur('0003');
        $this->annonces($vide, 1, ['stage' => RadarListingStage::Purged]);

        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $reponse = $this->getJson(self::ROUTE.'?fields[radar_advertisers]=id,display_name,nature')->assertOk();

        $this->assertSame([$gros->id, $petit->id], array_column($reponse->json('data'), 'id'));
        $this->assertSame([3, 2], array_column($reponse->json('data'), 'listings_count'));
        $this->assertSame('agency', $reponse->json('data.0.nature'));
        // Le sparse fieldset est respecté : le numéro non demandé n'est pas rendu.
        $this->assertArrayNotHasKey('phone', $reponse->json('data.0'));
        $this->assertSame('Annonceur 0002', $reponse->json('data.0.display_name'));

        $this->getJson(self::ROUTE.'?sort=listings_count')->assertOk()->assertJsonPath('data.0.id', $petit->id);
        $this->getJson(self::ROUTE.'?filter[nature]=agency')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_quartiers_prix_et_sites_lisent_l_instantane_puis_l_extraction(): void
    {
        $almadies = GeoNeighborhood::factory()->create(['name' => 'Almadies']);
        $mermoz = GeoNeighborhood::factory()->create(['name' => 'Mermoz']);
        $annonceur = $this->annonceur('0004');

        // Deux annonces collectées à Almadies (instantanés), une saisie à la main à Mermoz (extraction), une vente.
        foreach ([400000, 600000] as $prix) {
            $a = $this->annonceCollectee(['radar_advertiser_id' => $annonceur->id]);
            $this->instantane($a, '2026-10-01 08:00:00', '2026-10-29 08:00:00', ['geo_neighborhood_id' => $almadies->id, 'price' => $prix]);
        }
        RadarListing::factory()->extracted([
            'neighborhood' => ['neighborhood_id' => $mermoz->id],
            'price' => ['value' => 250000],
        ])->create(['radar_advertiser_id' => $annonceur->id]);
        RadarListing::factory()->extracted([
            'contract' => ['value' => 'sale'],
            'price' => ['value' => 90000000],
            'neighborhood' => ['neighborhood_id' => null],
        ])->create(['radar_advertiser_id' => $annonceur->id, 'source_site' => RadarSourceSite::Coinafrique]);

        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $ligne = $this->getJson(self::ROUTE)->assertOk()->json('data.0');

        $this->assertSame(4, $ligne['listings_count']);
        $this->assertSame(2, $ligne['neighborhoods_count']);
        $this->assertSame(['id' => $almadies->id, 'name' => 'Almadies', 'listings' => 2], $ligne['top_neighborhoods'][0]);
        $this->assertSame(['rent' => ['min' => 250000, 'max' => 600000], 'sale' => ['min' => 90000000, 'max' => 90000000]], $ligne['price_ranges']);
        $this->assertSame(['coinafrique', 'expat_dakar', 'other'], $ligne['sites']);
    }

    public function test_la_piste_commerciale_va_jusqu_a_la_demande_de_passage_en_agence(): void
    {
        $prospect = $this->annonceur('0010');
        $contacte = $this->annonceur('0011');
        $compte = $this->annonceur('0012', ['user_id' => User::factory()->create()->id]);
        $enAttente = $this->annonceur('0013', ['user_id' => User::factory()->create()->id]);
        $agence = $this->annonceur('0014', ['user_id' => User::factory()->create()->id]);
        $stop = $this->annonceur('0015', ['do_not_contact_at' => now()]);
        foreach ([$prospect, $contacte, $compte, $enAttente, $agence, $stop] as $annonceur) {
            $this->annonces($annonceur, 1);
        }
        RadarOutreach::factory()->create(['radar_advertiser_id' => $contacte->id]);
        AgencyUpgradeRequest::factory()->create(['submitted_by' => $enAttente->user_id, 'agency_id' => Agency::factory()->create()->id, 'status' => AgencyUpgradeRequestStatus::Pending]);
        AgencyUpgradeRequest::factory()->create(['submitted_by' => $agence->user_id, 'agency_id' => Agency::factory()->create()->id, 'status' => AgencyUpgradeRequestStatus::Approved]);

        $this->agirEnOperateur(PlatformProfileLevel::Support);
        // Même un sparse fieldset sans `user_id` ni `do_not_contact_at` rend la piste.
        $lignes = collect($this->getJson(self::ROUTE.'?fields[radar_advertisers]=id&per_page=50')->assertOk()->json('data'))->keyBy('id');

        $this->assertSame('prospect', $lignes[$prospect->id]['pipeline']);
        $this->assertSame('contacted', $lignes[$contacte->id]['pipeline']);
        $this->assertSame('account', $lignes[$compte->id]['pipeline']);
        $this->assertSame('upgrade_pending', $lignes[$enAttente->id]['pipeline']);
        $this->assertSame('pending', $lignes[$enAttente->id]['upgrade_status']);
        $this->assertSame('agency', $lignes[$agence->id]['pipeline']);
        $this->assertSame('do_not_contact', $lignes[$stop->id]['pipeline']);
    }

    public function test_la_route_est_gardee(): void
    {
        $this->getJson(self::ROUTE)->assertUnauthorized();
    }
}
