<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\SettingScope;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\Setting;
use App\Models\User;
use App\Services\Admin\PlatformSettingService;
use App\Services\Lease\EarlyTerminationService;
use App\Services\Lease\RentReviewService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2643 — `GET /api/leases/defaults?property_id=` : ce qu'un bail neuf reprend du bien, de
 * l'agence et de la plateforme, avec la SOURCE de chaque valeur (« depuis l'annonce », « réglage de
 * l'agence », « réglage de la plateforme »). Préremplir n'est pas imposer : rien n'est écrit.
 *
 * Décisions de la session (scratchpad `impl/lot2/decisions-2643.md`) : pénalité de retard à 0 par
 * défaut (1) ; le taux de commission de l'agence est une INFORMATION, jamais un terme du bail (3) ;
 * même autorisation que la création (4) ; indemnité bornée au domaine du bail, 0-12 (5) ; jour de
 * paiement 1, source plateforme (6) ; loyer prérempli seulement au mois (9).
 */
class LeaseDefaultsTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private User $bailleur;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = Agency::factory()->create(['commission_rate' => 8]);
        $this->agent = $this->agencyAgent($this->agence);
        $this->bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => $this->agence->id]);
        $this->bien = $this->bien();
    }

    /** @param  array<string, mixed>  $attributs */
    private function bien(array $attributs = []): Property
    {
        return Property::factory()->create($attributs + [
            'user_id' => $this->bailleur->id,
            'agency_id' => $this->agence->id,
            'type' => PropertyType::Apartment,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'price' => 670_000,
            'currency' => 'XOF',
            'deposit_months' => 2,
            'advance_months' => 1,
            'agency_fee_months' => null,
            'monthly_charges' => 25_000,
        ]);
    }

    private function defaults(?User $qui = null, mixed $bienId = 'courant'): TestResponse
    {
        $this->actingAsApi($qui ?? $this->agent);
        $id = $bienId === 'courant' ? $this->bien->id : $bienId;

        return $this->getJson('/api/leases/defaults'.($id === null ? '' : '?property_id='.$id));
    }

    private function reglageDAgence(string $cle, mixed $valeur): void
    {
        Setting::query()->create(['key' => $cle, 'value' => ['value' => $valeur], 'scope' => SettingScope::Agency, 'scope_id' => $this->agence->id]);
    }

    public function test_deux_mois_de_caution_donnent_deux_fois_le_loyer_depuis_l_annonce(): void
    {
        $this->defaults()->assertOk()
            ->assertJsonPath('data.monthly_rent', ['value' => 670000, 'source' => 'property'])
            ->assertJsonPath('data.deposit_months', ['value' => 2, 'source' => 'property'])
            ->assertJsonPath('data.deposit_amount', ['value' => 1340000, 'source' => 'property'])
            ->assertJsonPath('data.monthly_charges', ['value' => 25000, 'source' => 'property'])
            ->assertJsonPath('data.advance_months', ['value' => 1, 'source' => 'property'])
            ->assertJsonPath('data.type', 'residential_rent')
            ->assertJsonPath('data.currency', 'XOF');
    }

    public function test_le_total_a_l_entree_est_celui_du_cout_d_entree_du_bien(): void
    {
        // (670 000 + 25 000) × 1 + 670 000 × 2 = 2 035 000 — le chiffre de la maquette.
        $this->defaults()->assertOk()->assertJsonPath('data.entry_cost.total', 2035000);
    }

    public function test_la_penalite_de_retard_vient_de_l_agence_puis_du_catalogue(): void
    {
        $this->defaults()->assertOk()
            ->assertJsonPath('data.late_fee_percent', ['value' => 0, 'source' => 'platform'])
            ->assertJsonPath('data.late_fee_grace_days', ['value' => 0, 'source' => 'platform']);

        $this->reglageDAgence('lease.late_fee_percent', 5);
        $this->reglageDAgence('lease.late_fee_grace_days', 5);

        $this->defaults()->assertOk()
            ->assertJsonPath('data.late_fee_percent', ['value' => 5, 'source' => 'agency'])
            ->assertJsonPath('data.late_fee_grace_days', ['value' => 5, 'source' => 'agency']);
    }

    /**
     * r6 (vérification de TCK-2643) — une ligne d'agence qui ne porte aucune valeur n'est pas un
     * réglage de l'agence : la valeur ET la source retombent sur la plateforme, jamais « 0, agence ».
     *
     * @param  array<mixed>  $stocke
     */
    #[DataProvider('lignesDAgenceSansValeur')]
    public function test_une_ligne_d_agence_sans_valeur_retombe_sur_la_plateforme(array $stocke): void
    {
        app(PlatformSettingService::class)->bulkUpdate(
            ['lease.late_fee_percent' => 3, 'lease.late_fee_grace_days' => 4],
            User::factory()->create(),
        );
        foreach (['lease.late_fee_percent', 'lease.late_fee_grace_days', 'lease.rent_review_max_pct'] as $cle) {
            Setting::query()->create(['key' => $cle, 'value' => $stocke, 'scope' => SettingScope::Agency, 'scope_id' => $this->agence->id]);
        }

        $this->defaults()->assertOk()
            ->assertJsonPath('data.late_fee_percent', ['value' => 3, 'source' => 'platform'])
            ->assertJsonPath('data.late_fee_grace_days', ['value' => 4, 'source' => 'platform'])
            ->assertJsonPath('data.rent_review_max_pct.source', 'platform');
    }

    /** @return array<string, array{0: array<mixed>}> */
    public static function lignesDAgenceSansValeur(): array
    {
        return [
            'enveloppe value nulle' => [['value' => null]],
            'objet vide' => [[]],
        ];
    }

    /**
     * r6, r1 de la vérification de 65d3142b6 — UNE règle pour la valeur et pour la source
     * (`ScopedSetting::numericAgencyValue`) : une ligne d'agence sous le plancher du catalogue n'est pas
     * un réglage. `{"value": 0}` sur l'indemnité (`min:1`) et la révision (`gt:0`) rend le global ET la
     * source « platform » — le formulaire n'annonce plus un réglage de l'agence que le résolveur ignore.
     * Sur la pénalité de retard (`min:0`), 0 est un réglage valable : « pas de pénalité », de l'agence.
     * Une ligne héritée négative y est sous le plancher : le catalogue reprend la main.
     */
    public function test_une_ligne_d_agence_sous_le_plancher_n_est_pas_un_reglage_de_l_agence(): void
    {
        app(PlatformSettingService::class)->bulkUpdate([
            EarlyTerminationService::SETTING_KEY => 7,
            RentReviewService::SETTING_KEY => 12.5,
            'lease.late_fee_percent' => 3,
            'lease.late_fee_grace_days' => 4,
        ], User::factory()->create());
        foreach ([EarlyTerminationService::SETTING_KEY, RentReviewService::SETTING_KEY, 'lease.late_fee_percent'] as $cle) {
            $this->reglageDAgence($cle, 0);
        }
        $this->reglageDAgence('lease.late_fee_grace_days', -2);

        $this->defaults()->assertOk()
            ->assertJsonPath('data.early_termination_penalty_months', ['value' => 7, 'source' => 'platform'])
            ->assertJsonPath('data.rent_review_max_pct', ['value' => 12.5, 'source' => 'platform'])
            ->assertJsonPath('data.late_fee_percent', ['value' => 0, 'source' => 'agency'])
            ->assertJsonPath('data.late_fee_grace_days', ['value' => 4, 'source' => 'platform']);
    }

    public function test_l_indemnite_et_la_revision_disent_leur_source(): void
    {
        $this->defaults()->assertOk()
            ->assertJsonPath('data.early_termination_penalty_months', ['value' => EarlyTerminationService::SETTING_DEFAULT_MONTHS, 'source' => 'platform'])
            ->assertJsonPath('data.rent_review_max_pct.source', 'platform')
            ->assertJsonPath('data.payment_day', ['value' => 1, 'source' => 'platform']);

        $this->reglageDAgence('lease.rent_review_max_pct', 8);
        $this->defaults()->assertOk()->assertJsonPath('data.rent_review_max_pct', ['value' => 8, 'source' => 'agency']);
    }

    /** Le catalogue admet 24 mois, le bail 12 : la valeur préremplie ne doit pas faire refuser le POST. */
    public function test_une_indemnite_d_agence_au_dela_de_douze_mois_est_ramenee_a_douze(): void
    {
        $this->reglageDAgence(EarlyTerminationService::SETTING_KEY, 18);

        $this->defaults()->assertOk()
            ->assertJsonPath('data.early_termination_penalty_months', ['value' => 12, 'source' => 'agency']);
    }

    public function test_le_taux_de_l_agence_est_dit_au_personnel_et_tu_au_bailleur(): void
    {
        $this->defaults()->assertOk()
            ->assertJsonPath('data.agency_commission_rate', ['value' => 8, 'source' => 'agency']);

        $reponse = $this->defaults($this->bailleur)->assertOk();
        $this->assertArrayNotHasKey('agency_commission_rate', $reponse->json('data'));
        // Le taux ne devient jamais un terme du bail (décision 3) : il n'est pas offert à l'envoi.
        $this->assertArrayNotHasKey('commission_rate', $reponse->json('data'));
    }

    public function test_hors_de_l_agence_du_bien_le_refus_est_le_meme_que_pour_un_bien_absent(): void
    {
        $etranger = $this->agencyAgent(Agency::factory()->create());

        $this->defaults($etranger)->assertForbidden();
        $this->defaults($this->agent, 999_999)->assertForbidden();
        $this->defaults($this->agent, null)->assertForbidden();
        $this->defaults($this->agent, 'abc')->assertForbidden();
    }

    public function test_un_autre_bailleur_de_l_agence_est_refuse(): void
    {
        $autre = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $autre->id, 'agency_id' => $this->agence->id]);

        $this->defaults($autre)->assertForbidden();
    }

    public function test_un_bien_loue_a_l_annee_ne_preremplit_pas_le_loyer_mensuel(): void
    {
        $this->bien = $this->bien(['rent_period' => RentPeriod::Yearly, 'price' => 6_000_000]);

        $this->defaults()->assertOk()
            ->assertJsonPath('data.monthly_rent', null)
            ->assertJsonPath('data.deposit_amount', null)
            ->assertJsonPath('data.property_price', ['amount' => 6000000, 'period' => 'yearly', 'contract_type' => 'rent'])
            ->assertJsonPath('data.entry_cost', null);
    }

    public function test_un_bien_a_vendre_preremplit_une_vente(): void
    {
        $this->bien = $this->bien(['contract_type' => ContractType::Sale, 'rent_period' => null, 'price' => 45_000_000]);

        $this->defaults()->assertOk()
            ->assertJsonPath('data.type', 'sale')
            ->assertJsonPath('data.sale_price', ['value' => 45000000, 'source' => 'property'])
            ->assertJsonPath('data.monthly_rent', null);
    }

    public function test_un_bureau_preremplit_un_bail_commercial(): void
    {
        $this->bien = $this->bien(['type' => PropertyType::Office]);

        $this->defaults()->assertOk()->assertJsonPath('data.type', 'commercial_rent');
    }

    /**
     * TCK-2734 — l'étape « Vérifier » dit combien de candidatures ouvertes le bail fermera : avec leur
     * client, celles du futur locataire (réservation d'origine comprise) se complétant au lieu d'être
     * refusées.
     */
    public function test_les_candidatures_ouvertes_du_bien_sont_nommees_avec_leur_client(): void
    {
        $ouvertes = collect([BookingStatus::Pending, BookingStatus::Confirmed])->map(function (BookingStatus $statut) {
            $client = Customer::factory()->create(['agency_id' => $this->agence->id]);
            $b = Booking::factory()->create([
                'property_id' => $this->bien->id,
                'agency_id' => $this->agence->id,
                'customer_id' => $client->id,
                'kind' => BookingKind::Application,
                'status' => $statut,
                'start_date' => now()->addDays(5)->toDateString(),
                'end_date' => now()->addYear()->toDateString(),
            ]);

            return ['id' => $b->id, 'customer_id' => $client->id];
        });
        Booking::factory()->create([
            'property_id' => $this->bien->id,
            'agency_id' => $this->agence->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $this->agence->id])->id,
            'kind' => BookingKind::Application,
            'status' => BookingStatus::Rejected,
            'start_date' => now()->addDays(5)->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
        ]);

        $this->assertSame($ouvertes->all(), $this->defaults()->assertOk()->json('data.open_applications'));
    }
}
