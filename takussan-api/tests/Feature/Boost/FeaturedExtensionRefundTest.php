<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\CreditMovementType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\PropertyBoostTranche;
use App\Models\User;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-942 (P24.05, amendement du 2026-10-18 d'ADR-0061) — une Vedette prolongée se rembourse tranche
 * par tranche, les jours restants les plus tardifs d'abord, chacun au prix de la tranche qui l'a
 * acheté. Une tranche offerte ne rend rien. Avant : le prix cumulé était étalé sur la durée cumulée,
 * et une Vedette offerte 30 j puis achetée 7 j rendait 6 crédits sur les 20 des jours payés restants.
 */
class FeaturedExtensionRefundTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-10-18 10:00:00'));
        $this->agency = Agency::factory()->create();
        $this->admin = $this->actingAsRole('agency_admin', ['agency' => $this->agency]);
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 500, now()->addDays(180));
    }

    public function test_offerte_puis_achetee_rend_les_jours_payes_restants_en_entier(): void
    {
        $this->offrir(30);
        $vedette = $this->acheter(7);
        $this->travel(25)->days();

        $this->property->update(['status' => PropertyStatus::Rented]);

        // 12 jours pleins restent : les 7 achetés (20 crédits), puis 5 offerts (0). Prorata cumulé : 6.
        $vedette->refresh();
        $this->assertSame(BoostStatus::Refunded, $vedette->status);
        $this->assertSame(20, $vedette->refunded_credits);
        $this->assertSame(500, app(CreditLedger::class)->balance($this->agency));
    }

    public function test_offerte_puis_achetee_en_pause_rend_les_jours_payes_restants(): void
    {
        $this->offrir(30);
        $vedette = $this->acheter(7);
        $this->travel(25)->days();
        $this->property->update(['visibility' => PropertyVisibility::Private]);
        $this->assertSame(BoostStatus::Paused, $vedette->fresh()->status);
        $this->travel(40)->days();

        $this->property->update(['status' => PropertyStatus::Rented]);

        $this->assertSame(20, $vedette->fresh()->refunded_credits, 'la pause ne consomme rien : les 7 jours payés restent');
    }

    public function test_achetee_puis_offerte_ne_rend_que_les_jours_payes_restants(): void
    {
        $vedette = $this->acheter(7);
        $this->offrir(30);
        $this->travel(1)->days();

        $this->property->update(['status' => PropertyStatus::Rented]);

        // 36 jours pleins : les 30 offerts (0), puis 6 achetés → floor(20 × 6 / 7) = 17. Prorata cumulé : 19.
        $vedette->refresh();
        $this->assertSame(17, $vedette->refunded_credits);
        $this->assertSame(500 - 20 + 17, app(CreditLedger::class)->balance($this->agency));
    }

    public function test_achetee_puis_offerte_ne_rend_rien_quand_seuls_les_jours_offerts_restent(): void
    {
        $vedette = $this->acheter(7);
        $this->offrir(30);
        $this->travel(31)->days();

        $this->property->update(['status' => PropertyStatus::Rented]);

        // 6 jours pleins, tous offerts. Prorata cumulé : floor(20 × 6 / 37) = 3.
        $vedette->refresh();
        $this->assertSame(BoostStatus::Ended, $vedette->status, 'rien n’est rendu : le boost n’est pas « remboursé »');
        $this->assertSame(0, (int) $vedette->refunded_credits);
        $this->assertSame(500 - 20, app(CreditLedger::class)->balance($this->agency));
    }

    public function test_une_vedette_non_prolongee_se_rembourse_comme_avant(): void
    {
        $vedette = $this->acheter(7);
        $this->travel(2)->days();
        $this->travel(3)->hours();

        $this->property->update(['status' => PropertyStatus::Rented]);

        // 4 j 21 h restants → 4 jours pleins → floor(20 × 4 / 7) = 11, comme `BoostPauseAndRefundTest`.
        $this->assertSame(11, $vedette->fresh()->refunded_credits);
        $this->assertCount(1, $vedette->tranches);
    }

    public function test_chaque_achat_ou_offre_ajoute_une_tranche_sans_reecrire_la_precedente(): void
    {
        $this->offrir(30);
        $vedette = $this->acheter(7);

        $tranches = $vedette->fresh()->tranches;
        $this->assertSame([1, 2], $tranches->pluck('position')->all());
        $this->assertSame([0, 20], $tranches->pluck('price_credits')->all());
        $this->assertSame([30, 7], $tranches->pluck('duration_days')->all());
        $this->assertSame([true, false], $tranches->pluck('offered')->all());
        // La ligne garde le cumul, qu'affichent la ressource et la console.
        $this->assertSame(20, $vedette->fresh()->price_credits);
        $this->assertSame(37, $vedette->fresh()->duration_days);
    }

    /**
     * Reprise : une Vedette prolongée AVANT les tranches n'en a aucune. Elle est sa propre tranche
     * unique, au prix et à la durée cumulés — et une prolongation postérieure l'écrit d'abord, pour
     * que la somme des tranches reste égale à la ligne.
     */
    public function test_une_vedette_prolongee_avant_les_tranches_est_une_tranche_unique(): void
    {
        $ancienne = $this->vedetteCumuleeSansTranche(price: 20, days: 37);
        $this->travel(25)->days();

        $this->property->update(['status' => PropertyStatus::Rented]);

        // 12 jours pleins sur une tranche unique 20 / 37 → floor(20 × 12 / 37) = 6, comme avant.
        $this->assertSame(6, $ancienne->fresh()->refunded_credits);
    }

    public function test_prolonger_une_vedette_sans_tranche_ecrit_d_abord_sa_tranche_de_reprise(): void
    {
        $ancienne = $this->vedetteCumuleeSansTranche(price: 20, days: 37);

        $this->acheter(7);

        $tranches = $ancienne->fresh()->tranches;
        $this->assertSame([[1, 20, 37], [2, 20, 7]], $tranches->map(fn (PropertyBoostTranche $t) => [$t->position, $t->price_credits, $t->duration_days])->all());
        $this->assertSame(40, $ancienne->fresh()->price_credits);
        $this->assertSame(44, $ancienne->fresh()->duration_days);
    }

    /**
     * Le rang fait l'ordre, jamais l'id ni l'ordre d'insertion : la tranche achetée (rang 2) est
     * écrite AVANT l'offerte (rang 1), et ce sont pourtant ses jours qui restent les plus tardifs.
     */
    public function test_le_rang_fait_l_ordre_des_tranches_pas_l_ordre_d_insertion(): void
    {
        $vedette = $this->vedetteCumuleeSansTranche(price: 20, days: 37);
        PropertyBoostTranche::factory()->create(['property_boost_id' => $vedette->id, 'position' => 2, 'price_credits' => 20, 'duration_days' => 7]);
        PropertyBoostTranche::factory()->offered()->create(['property_boost_id' => $vedette->id, 'position' => 1, 'duration_days' => 30]);
        $this->assertSame([2, 1], PropertyBoostTranche::query()->where('property_boost_id', $vedette->id)->orderBy('id')->pluck('position')->all());
        $this->travel(25)->days();

        $this->property->update(['status' => PropertyStatus::Rented]);

        // 12 jours pleins : les 7 du rang 2 (20 crédits), puis 5 du rang 1 (offerts, 0).
        $this->assertSame(20, $vedette->fresh()->refunded_credits);
    }

    public function test_la_fabrique_rend_une_tranche_rattachee_a_une_vedette(): void
    {
        $tranche = PropertyBoostTranche::factory()->create();

        $this->assertSame(BoostKind::Featured, $tranche->boost->kind);
        $this->assertSame(1, $tranche->position);
    }

    private function acheter(int $days): PropertyBoost
    {
        return app(BoostPurchaseService::class)->purchase($this->property->fresh(), $this->produit($days), $this->admin);
    }

    private function offrir(int $days): PropertyBoost
    {
        return app(BoostPurchaseService::class)->offerFeatured($this->property->fresh(), $this->produit($days), $this->admin, 'Geste commercial');
    }

    private function produit(int $days): BoostProduct
    {
        return BoostProduct::query()->where('kind', BoostKind::Featured)->where('duration_days', $days)->sole();
    }

    private function vedetteCumuleeSansTranche(int $price, int $days): PropertyBoost
    {
        $boost = PropertyBoost::query()->create([
            'property_id' => $this->property->id, 'agency_id' => $this->agency->id, 'kind' => BoostKind::Featured,
            'price_credits' => $price, 'duration_days' => $days, 'starts_at' => now(), 'ends_at' => now()->addDays($days),
            'status' => BoostStatus::Active, 'purchased_by_id' => $this->admin->id,
        ]);
        app(CreditLedger::class)->spend($this->agency, $price, CreditMovementType::Spend, $boost, $this->admin);

        return $boost;
    }
}
