<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-822 (P24.01) — un achat de boost rejoué avec la même `Idempotency-Key` ne débite qu'une fois :
 * la clé est unique par espace sur 24 h, et le rejeu rend 200 avec le boost déjà écrit.
 */
class BoostPurchaseIdempotencyTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 500, now()->addDays(60));
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
    }

    private function badge(): BoostProduct
    {
        return BoostProduct::query()->where('kind', 'badge')->orderBy('duration_days')->orderBy('id')->firstOrFail();
    }

    private function featured(): BoostProduct
    {
        return BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole();
    }

    private function acheter(BoostProduct $offre, ?string $cle, ?Property $bien = null)
    {
        $bien ??= $this->property;

        return $this->apiPost(
            "/api/properties/{$bien->id}/boosts",
            ['product_id' => $offre->id],
            $cle === null ? [] : ['Idempotency-Key' => $cle],
        );
    }

    public function test_un_badge_rejoue_avec_la_meme_cle_ne_debite_qu_une_fois(): void
    {
        $offre = $this->badge();

        $premier = $this->acheter($offre, 'ouverture-1')->assertCreated();
        $this->travel(30)->seconds();
        $second = $this->acheter($offre, 'ouverture-1')->assertOk();

        $this->assertSame($premier->json('data.id'), $second->json('data.id'));
        $this->assertSame(500 - $offre->price_credits, $second->json('balance'));
        $this->assertSame(500 - $offre->price_credits, app(CreditLedger::class)->balance($this->agency->id));
        $this->assertSame(1, PropertyBoost::query()->where('property_id', $this->property->id)->count());
    }

    public function test_une_vedette_rejouee_n_est_ni_debitee_ni_prolongee_deux_fois(): void
    {
        $offre = $this->featured();

        $premier = $this->acheter($offre, 'ouverture-2')->assertCreated();
        $this->acheter($offre, 'ouverture-2')->assertOk()->assertJsonPath('data.id', $premier->json('data.id'));

        $boost = PropertyBoost::query()->findOrFail($premier->json('data.id'));
        $this->assertSame($offre->duration_days, $boost->duration_days);
        $this->assertSame($offre->price_credits, $boost->price_credits);
        $this->assertSame(500 - $offre->price_credits, app(CreditLedger::class)->balance($this->agency->id));
    }

    public function test_deux_cles_distinctes_sont_deux_achats(): void
    {
        $offre = $this->badge();

        $this->acheter($offre, 'ouverture-a')->assertCreated();
        $this->acheter($offre, 'ouverture-b')->assertCreated();

        $this->assertSame(500 - 2 * $offre->price_credits, app(CreditLedger::class)->balance($this->agency->id));
    }

    public function test_la_meme_cle_pour_une_autre_offre_est_refusee_sans_debit(): void
    {
        $this->acheter($this->badge(), 'ouverture-3')->assertCreated();
        $solde = app(CreditLedger::class)->balance($this->agency->id);

        $this->acheter($this->featured(), 'ouverture-3')
            ->assertStatus(422)
            ->assertJsonPath('code', 'boost.idempotency_key_reused');

        $this->assertSame($solde, app(CreditLedger::class)->balance($this->agency->id));
    }

    public function test_la_meme_cle_pour_un_autre_bien_de_l_espace_est_refusee(): void
    {
        $autre = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
        $this->acheter($this->badge(), 'ouverture-4')->assertCreated();

        $this->acheter($this->badge(), 'ouverture-4', $autre)
            ->assertStatus(422)
            ->assertJsonPath('code', 'boost.idempotency_key_reused');
    }

    public function test_la_cle_expire_apres_24_heures(): void
    {
        $offre = $this->badge();

        $this->acheter($offre, 'ouverture-5')->assertCreated();
        $this->travel(25)->hours();
        $this->acheter($offre, 'ouverture-5')->assertCreated();

        $this->assertSame(500 - 2 * $offre->price_credits, app(CreditLedger::class)->balance($this->agency->id));
    }
}
