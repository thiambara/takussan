<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Services\Boost\BoostSettings;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-824 (P24.02) — la lecture des boosts d'un bien dit, avant l'achat, à partir de quand une
 * Remontée est de nouveau possible : c'est ce que le dialogue d'achat annonce.
 */
class PropertyBoostReadAheadTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
    }

    public function test_sans_remontee_passee_aucun_delai_n_est_annonce(): void
    {
        $this->apiGet("/api/properties/{$this->property->id}/boosts")
            ->assertOk()
            ->assertJsonPath('bump_available_at', null);
    }

    public function test_apres_une_remontee_la_lecture_rend_la_fin_du_delai(): void
    {
        $this->freezeSecond();
        $heures = app(BoostSettings::class)->bumpCooldownHours();
        $remontee = BoostProduct::query()->where('kind', 'bump')->sole();
        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => $remontee->id])->assertCreated();

        $this->apiGet("/api/properties/{$this->property->id}/boosts")
            ->assertOk()
            ->assertJsonPath('bump_available_at', now()->addHours($heures)->toIso8601String());

        // Le délai annoncé est celui que l'achat applique : la même date que le refus.
        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => $remontee->id])
            ->assertStatus(422)
            ->assertJsonPath('params.available_at', now()->addHours($heures)->toIso8601String());
    }

    public function test_un_delai_ecoule_n_est_plus_annonce(): void
    {
        $heures = app(BoostSettings::class)->bumpCooldownHours();
        $remontee = BoostProduct::query()->where('kind', 'bump')->sole();
        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => $remontee->id])->assertCreated();

        $this->travel($heures + 1)->hours();

        $this->apiGet("/api/properties/{$this->property->id}/boosts")
            ->assertOk()
            ->assertJsonPath('bump_available_at', null);
    }
}
