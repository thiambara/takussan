<?php

namespace Tests\Feature\Directory;

use App\Models\Activity;
use App\Models\Address;
use App\Models\Agency;
use App\Models\AgencySpotlight;
use App\Models\CreditMovement;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\GeoCity;
use App\Models\Property;
use App\Models\User;
use App\Services\Admin\PlatformSettingService;
use App\Services\Boost\SpotlightPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-2525 (amendement du 2026-11-16 d'ADR-0061) — l'agence achète la place « Mise en avant » de
 * l'annuaire d'une ville avec ses crédits. Débit et place dans une transaction, refus avant toute
 * écriture, remboursement à la suspension selon le réglage, statistiques du super-admin.
 */
class AgencySpotlightPurchaseTest extends ApiTestCase
{
    use RefreshDatabase;

    private GeoCity $dakar;

    private CreditLedger $ledger;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-12-01 10:00:00');
        $this->dakar = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        $this->ledger = app(CreditLedger::class);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function agence(string $nom, int $credits = 500, string $ville = 'Dakar', array $attributs = []): Agency
    {
        $agence = Agency::factory()->create(['name' => $nom, 'status' => AgencyStatus::Active, ...$attributs]);
        $bien = Property::factory()->published()->create(['agency_id' => $agence->id]);
        Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'city' => $ville]);
        if ($credits > 0) {
            $this->ledger->grant($agence, CreditLotOrigin::AdminGrant, $credits, now()->addDays(180));
        }

        return $agence;
    }

    /** @param  array<string, mixed>  $valeurs */
    private function regler(array $valeurs): void
    {
        app(PlatformSettingService::class)->bulkUpdate($valeurs, User::factory()->create());
    }

    private function acheter(?int $ville, ?string $jour = null, array $entetes = []): TestResponse
    {
        return $this->apiPost('/api/credits/spotlights', ['geo_city_id' => $ville] + ($jour !== null ? ['starts_on' => $jour] : []), $entetes);
    }

    public function test_l_achat_debite_le_prix_et_cree_la_place_dans_la_meme_transaction(): void
    {
        $agence = $this->agence('Teranga');
        $acheteur = $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        $id = $this->acheter($this->dakar->id)
            ->assertCreated()
            ->assertJsonPath('data.origin', 'purchased')
            ->assertJsonPath('data.price_credits', 100)
            ->assertJsonPath('data.city.name', 'Dakar')
            ->assertJsonPath('data.starts_at', '2026-12-01T10:00:00+00:00')
            ->assertJsonPath('data.ends_at', '2026-12-08T10:00:00+00:00')
            ->assertJsonPath('balance', 400)
            ->json('data.id');

        $place = AgencySpotlight::query()->findOrFail($id);
        $this->assertNull($place->granted_by_id);
        $this->assertSame($acheteur->id, $place->purchased_by_id);
        $this->assertSame(-100, (int) CreditMovement::query()->where('agency_spotlight_id', $id)->where('type', 'spend')->sum('amount'));
        $this->assertSame([], $this->ledger->invariantViolations());
        $this->assertTrue(Activity::query()->where('event', 'agency_spotlight_purchased')->exists());

        // La place achetée est celle que l'annuaire public sert pour Dakar.
        $this->getJson('/api/public/agencies?filter[city]=Dakar')->assertOk()->assertJsonPath('spotlight.name', 'Teranga');
    }

    public function test_les_reglages_de_prix_et_de_duree_sont_lus_et_figes_sur_la_place(): void
    {
        $this->regler(['spotlight.price_credits' => 30, 'spotlight.duration_days' => 3]);
        $agence = $this->agence('Teranga');
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        $id = $this->acheter($this->dakar->id)->assertCreated()->assertJsonPath('balance', 470)->assertJsonPath('data.ends_at', '2026-12-04T10:00:00+00:00')->json('data.id');

        $this->regler(['spotlight.price_credits' => 999]);
        $this->assertSame(30, AgencySpotlight::query()->findOrFail($id)->price_credits);
    }

    /** AC1 — la contrainte d'exclusion refuse l'insertion : rien n'est débité, et la transaction reste saine. */
    public function test_ac1_un_achat_qui_echoue_sur_la_contrainte_de_place_ne_debite_rien(): void
    {
        $agence = $this->agence('Teranga');
        $autre = $this->agence('Autre');
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);
        // Un écrivain qui ne prend pas le verrou de la ville pose une place concurrente APRÈS le
        // contrôle de chevauchement, juste avant l'insertion : seule la contrainte d'exclusion la voit.
        AgencySpotlight::creating(function (AgencySpotlight $place) use ($autre): void {
            if ($place->origin === AgencySpotlight::ORIGIN_PURCHASED && ! AgencySpotlight::query()->where('agency_id', $autre->id)->exists()) {
                AgencySpotlight::withoutEvents(fn () => AgencySpotlight::query()->create([
                    'agency_id' => $autre->id, 'geo_city_id' => $this->dakar->id,
                    'starts_at' => now()->subDay(), 'ends_at' => now()->addDays(30),
                ]));
            }
        });

        $this->acheter($this->dakar->id)->assertStatus(422)->assertJsonPath('code', 'credits.spotlight_taken');

        $this->assertSame(500, $this->ledger->balance($agence));
        $this->assertFalse(CreditMovement::query()->where('agency_id', $agence->id)->where('type', 'spend')->exists());
        $this->assertFalse(AgencySpotlight::query()->where('agency_id', $agence->id)->exists());
    }

    public function test_place_prise_refus_lisible_avec_la_prochaine_disponibilite(): void
    {
        $this->agenceOccupe('2026-12-01 00:00:00', '2026-12-05 00:00:00');
        $agence = $this->agence('Teranga');
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        $this->apiGet('/api/credits/spotlights/quote?geo_city_id='.$this->dakar->id)
            ->assertOk()
            ->assertJsonPath('data.available', false)
            ->assertJsonPath('data.reason', 'taken')
            ->assertJsonPath('data.next_free_at', '2026-12-05T00:00:00+00:00')
            ->assertJsonPath('data.balance_after', 400);

        $this->acheter($this->dakar->id)->assertStatus(422)->assertJsonPath('code', 'credits.spotlight_taken');
        $this->assertSame(500, $this->ledger->balance($agence));

        // Le jour même de la libération, la place se vend.
        $this->acheter($this->dakar->id, '2026-12-05')->assertCreated()->assertJsonPath('data.starts_at', '2026-12-05T00:00:00+00:00');
    }

    public function test_file_d_attente_l_achat_prend_le_premier_creneau_libre(): void
    {
        $this->regler(['spotlight.when_taken' => 'next_free']);
        $this->agenceOccupe('2026-12-01 00:00:00', '2026-12-05 00:00:00');
        $this->agenceOccupe('2026-12-06 00:00:00', '2026-12-09 00:00:00');
        $agence = $this->agence('Teranga');
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        // Le trou du 5 au 6 est trop court pour 7 jours : la place commence le 9.
        $this->apiGet('/api/credits/spotlights/quote?geo_city_id='.$this->dakar->id)->assertJsonPath('data.available', true)->assertJsonPath('data.starts_at', '2026-12-09T00:00:00+00:00');
        $this->acheter($this->dakar->id)->assertCreated()->assertJsonPath('data.starts_at', '2026-12-09T00:00:00+00:00')->assertJsonPath('data.ends_at', '2026-12-16T00:00:00+00:00');

        // Au-delà de l'horizon de réservation, pas de créneau.
        $this->regler(['spotlight.max_advance_days' => 10]);
        $this->acheter($this->dakar->id)->assertStatus(422)->assertJsonPath('code', 'credits.spotlight_no_free_period');
        $this->acheter($this->dakar->id, '2026-12-30')->assertStatus(422)->assertJsonPath('code', 'credits.spotlight_too_far');
    }

    public function test_ac3_credits_insuffisants_refus_avant_toute_ecriture(): void
    {
        $agence = $this->agence('Teranga', 60);
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);
        // « Avant toute écriture » : pas même une insertion annulée ensuite par la transaction.
        $ecritures = [];
        DB::listen(function ($requete) use (&$ecritures): void {
            if (preg_match('/^\s*(insert|update|delete)\b.*"?(agency_spotlights|credit_movements|credit_lots)"?/i', $requete->sql)) {
                $ecritures[] = $requete->sql;
            }
        });

        $this->acheter($this->dakar->id)
            ->assertStatus(422)
            ->assertJsonPath('code', 'credits.insufficient')
            ->assertJsonPath('message', __('errors.credits.insufficient', ['missing' => 40, 'balance' => 60]));

        $this->assertFalse(AgencySpotlight::query()->exists());
        $this->assertSame(1, CreditMovement::query()->where('agency_id', $agence->id)->count());
        $this->assertSame([], $ecritures);
    }

    public function test_seule_une_agence_que_l_annuaire_montre_achete_et_seulement_avec_boost_spend(): void
    {
        $agence = $this->agence('Teranga');
        $this->apiActingAsRole('agent', ['agency' => $agence]);
        $this->acheter($this->dakar->id)->assertForbidden();

        // Sans bien public à Thiès, pas de place à Thiès.
        $thies = GeoCity::factory()->create(['name' => 'Thiès', 'slug' => 'thies']);
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);
        $this->acheter($thies->id)->assertStatus(422)->assertJsonPath('code', 'credits.spotlight_agency_not_listed');

        $individuel = $this->agence('Hôte', 500, 'Dakar', ['kind' => AgencyKind::Individual]);
        $this->apiActingAsRole('agency_admin', ['agency' => $individuel]);
        $this->acheter($this->dakar->id)->assertStatus(422)->assertJsonPath('code', 'credits.spotlight_agency_not_listed');

        $this->assertFalse(AgencySpotlight::query()->exists());
    }

    public function test_vente_fermee_et_annuaire_sans_ville_fermes_par_reglage(): void
    {
        $agence = $this->agence('Teranga');
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        $this->acheter(null)->assertStatus(422)->assertJsonPath('code', 'credits.spotlight_directory_wide_closed');
        $this->regler(['spotlight.sell_directory_wide' => true]);
        $this->acheter(null)->assertCreated()->assertJsonPath('data.city', null);

        $this->regler(['spotlight.sale_enabled' => false]);
        $this->acheter($this->dakar->id)->assertStatus(422)->assertJsonPath('code', 'credits.spotlight_sale_closed');
    }

    public function test_une_cle_d_idempotence_rejoue_l_achat_sans_second_debit(): void
    {
        $this->regler(['spotlight.when_taken' => 'next_free']);
        $agence = $this->agence('Teranga');
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        $premier = $this->acheter($this->dakar->id, null, ['Idempotency-Key' => 'k-1'])->assertCreated()->json('data.id');
        $this->acheter($this->dakar->id, null, ['Idempotency-Key' => 'k-1'])->assertOk()->assertJsonPath('data.id', $premier);

        $this->assertSame(400, $this->ledger->balance($agence));
        $this->assertSame(1, AgencySpotlight::query()->count());
    }

    public function test_une_place_offerte_bloque_par_defaut_et_cede_sous_yields(): void
    {
        $offerte = $this->agenceOccupe('2026-11-28 00:00:00', '2026-12-20 00:00:00');
        $future = $this->agenceOccupe('2026-12-20 00:00:00', '2026-12-25 00:00:00');
        $agence = $this->agence('Teranga');
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        $this->acheter($this->dakar->id, '2026-12-15')->assertStatus(422)->assertJsonPath('code', 'credits.spotlight_taken');

        $this->regler(['spotlight.offered_overlap' => 'yields']);
        $this->acheter($this->dakar->id, '2026-12-15')->assertCreated();

        // Déjà commencée : écourtée au début de l'achat ; à venir dans la période : libérée.
        $this->assertSame('2026-12-15 00:00:00', $offerte->fresh()->ends_at->format('Y-m-d H:i:s'));
        $this->assertNull($offerte->fresh()->cancelled_at);
        $this->assertNotNull($future->fresh()->cancelled_at);
        $this->assertSame(2, Activity::query()->where('event', 'agency_spotlight_offer_yielded')->count());
    }

    public function test_suspension_rembourse_au_prorata_les_jours_pleins_non_servis_et_libere_la_place(): void
    {
        $agence = $this->agence('Teranga');
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);
        $id = $this->acheter($this->dakar->id)->assertCreated()->json('data.id');

        // 2 jours et 3 heures servis sur 7 : 4 jours pleins restants → floor(100 × 4 / 7) = 57.
        Carbon::setTestNow('2026-12-03 13:00:00');
        $agence->update(['status' => AgencyStatus::Suspended]);

        $place = AgencySpotlight::query()->findOrFail($id);
        $this->assertNotNull($place->cancelled_at);
        $this->assertSame(57, $place->refunded_credits);
        $this->assertSame(457, $this->ledger->balance($agence));
        $this->assertSame([], $this->ledger->invariantViolations());

        // Idempotent : la levée, une nouvelle suspension, le tick ne rendent rien de plus.
        $agence->update(['status' => AgencyStatus::Active]);
        $agence->update(['status' => AgencyStatus::Suspended]);
        $this->artisan('boosts:tick')->assertSuccessful();
        $this->assertSame(457, $this->ledger->balance($agence));

        // La place libérée ne tient plus la ville : une autre agence l'achète.
        $autre = $this->agence('Autre');
        $this->apiActingAsRole('agency_admin', ['agency' => $autre]);
        $this->acheter($this->dakar->id)->assertCreated();
    }

    public function test_suspension_regle_full_rend_tout_et_none_garde_la_place(): void
    {
        $this->regler(['spotlight.refund_on_suspension' => 'full']);
        $a = $this->agence('A');
        $this->apiActingAsRole('agency_admin', ['agency' => $a]);
        $idA = $this->acheter($this->dakar->id)->assertCreated()->json('data.id');
        Carbon::setTestNow('2026-12-05 10:00:00');
        $a->update(['status' => AgencyStatus::Suspended]);
        $this->assertSame(100, AgencySpotlight::query()->findOrFail($idA)->refunded_credits);
        $this->assertSame(500, $this->ledger->balance($a));

        $this->regler(['spotlight.refund_on_suspension' => 'none']);
        $b = $this->agence('B');
        $this->apiActingAsRole('agency_admin', ['agency' => $b]);
        $idB = $this->acheter($this->dakar->id)->assertCreated()->json('data.id');
        $b->update(['status' => AgencyStatus::Suspended]);
        $this->assertNull(AgencySpotlight::query()->findOrFail($idB)->cancelled_at);
        $this->assertSame(400, $this->ledger->balance($b));
    }

    public function test_le_tick_rattrape_une_suspension_ecrite_en_masse(): void
    {
        $agence = $this->agence('Teranga');
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);
        $id = $this->acheter($this->dakar->id, '2026-12-10')->assertCreated()->json('data.id');

        Agency::query()->whereKey($agence->id)->update(['status' => AgencyStatus::Suspended->value]);
        $this->assertNull(AgencySpotlight::query()->findOrFail($id)->cancelled_at);

        $this->artisan('boosts:tick')->assertSuccessful();
        // Pas encore commencée : rendue en entier.
        $this->assertSame(100, AgencySpotlight::query()->findOrFail($id)->refunded_credits);
        $this->assertSame(500, $this->ledger->balance($agence));
    }

    public function test_le_super_admin_retire_une_place_achetee_en_la_remboursant(): void
    {
        $agence = $this->agence('Teranga');
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);
        $id = $this->acheter($this->dakar->id)->assertCreated()->json('data.id');

        $operateur = User::factory()->create();
        Carbon::setTestNow('2026-12-01 11:00:00');
        app(SpotlightPurchaseService::class)->revoke(AgencySpotlight::query()->findOrFail($id), $operateur);

        $place = AgencySpotlight::query()->findOrFail($id);
        $this->assertNotNull($place->cancelled_at);
        $this->assertSame(85, $place->refunded_credits); // 6 jours pleins sur 7 : floor(600 / 7)
        $this->assertSame(485, $this->ledger->balance($agence));
    }

    public function test_les_statistiques_du_super_admin_comptent_les_places_et_leurs_credits(): void
    {
        $agence = $this->agence('Teranga');
        $this->agenceOccupe('2026-12-20 00:00:00', '2026-12-25 00:00:00');
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);
        $this->acheter($this->dakar->id)->assertCreated();
        Carbon::setTestNow('2026-12-01 11:00:00'); // 6 jours pleins restants sur 7 : floor(600 / 7) = 85
        $agence->update(['status' => AgencyStatus::Suspended]);

        $this->apiActingAsRole('super_admin');
        $this->apiGet('/api/admin/boost-stats?from=2026-11-30&to=2026-12-01')
            ->assertOk()
            ->assertJsonPath('spotlights.purchased', 1)
            ->assertJsonPath('spotlights.offered', 1)
            ->assertJsonPath('spotlights.credits_spent', 100)
            ->assertJsonPath('spotlights.credits_refunded', 85);
    }

    public function test_la_page_lit_reglages_solde_et_places_de_l_espace(): void
    {
        $agence = $this->agence('Teranga');
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);
        $this->acheter($this->dakar->id)->assertCreated();

        $this->apiGet('/api/credits/spotlights')
            ->assertOk()
            ->assertJsonPath('data.settings.price_credits', 100)
            ->assertJsonPath('data.settings.when_taken', 'refuse')
            ->assertJsonPath('data.balance', 400)
            ->assertJsonCount(1, 'data.spotlights');

        $this->apiActingAsRole('customer');
        $this->apiGet('/api/credits/spotlights')->assertStatus(422)->assertJsonPath('code', 'credits.no_space');
    }

    /** Une place OFFERTE à une autre agence, sur Dakar. */
    private function agenceOccupe(string $debut, string $fin): AgencySpotlight
    {
        $autre = Agency::factory()->create(['status' => AgencyStatus::Active]);

        return AgencySpotlight::query()->create([
            'agency_id' => $autre->id, 'geo_city_id' => $this->dakar->id,
            'starts_at' => $debut, 'ends_at' => $fin, 'note' => 'Offerte',
        ]);
    }
}
