<?php

namespace Tests\Feature\Lease;

use App\Domain\Settings\EditablePlatformSettings;
use App\Http\Requests\Api\StoreLeaseRequest;
use App\Http\Requests\RenewLeaseRequest;
use App\Http\Requests\UpdateLeaseRequest;
use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\SettingScope;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\Setting;
use App\Models\User;
use App\Services\Lease\EarlyTerminationService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2842 — l'indemnité de départ anticipé a UNE borne, déclarée dans la règle du catalogue
 * (`EditablePlatformSettings`) et lue par le préremplissage du bail neuf (`LeaseDefaults`), la
 * validation du bail (`StoreLeaseRequest`, `UpdateLeaseRequest`, `RenewLeaseRequest`) et la lecture à
 * l'exécution (`EarlyTerminationService::resolvePenaltyMonths`). Le 0 (« aucune indemnité ») a le même
 * sens partout : un bail le porte, une agence le règle.
 *
 * Les attentes lisent la borne du catalogue, jamais un nombre recopié : changer la règle du catalogue
 * doit changer chaque lieu, et un lieu qui garde sa constante rougit.
 */
class BorneDeLIndemniteDeDepartTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const CLE = EarlyTerminationService::SETTING_KEY;

    private Agency $agence;

    private User $admin;

    private User $agent;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agence);
        $this->agent = $this->agencyAgent($this->agence);
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agence->id]);
        $this->bien = Property::factory()->create([
            'user_id' => $bailleur->id,
            'agency_id' => $this->agence->id,
            'type' => PropertyType::Apartment,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'price' => 300_000,
            'currency' => 'XOF',
        ]);
    }

    private function max(): int
    {
        return (int) EditablePlatformSettings::borne(self::CLE, 'max');
    }

    private function min(): int
    {
        return (int) EditablePlatformSettings::borne(self::CLE, 'min');
    }

    private function prefill(): mixed
    {
        $this->actingAsApi($this->agent);

        return $this->getJson('/api/leases/defaults?property_id='.$this->bien->id)->assertOk()
            ->json('data.early_termination_penalty_months');
    }

    /** Une ligne écrite avant la règle, sans passer par la validation. */
    private function ligneBrute(int $valeur): void
    {
        Setting::query()->create([
            'key' => self::CLE, 'value' => ['value' => $valeur],
            'scope' => SettingScope::Agency, 'scope_id' => $this->agence->id,
        ]);
    }

    public function test_la_borne_retenue_est_de_zero_a_douze_mois(): void
    {
        $this->assertSame(0, $this->min());
        $this->assertSame(12, $this->max());
    }

    // ── AC2 : la validation du bail lit la borne du catalogue ────────────────────────────────────

    /** @return array<string, array{class-string<FormRequest>}> */
    public static function requetesDuBail(): array
    {
        return [
            'création' => [StoreLeaseRequest::class],
            'modification' => [UpdateLeaseRequest::class],
            'renouvellement' => [RenewLeaseRequest::class],
        ];
    }

    /** @param  class-string<FormRequest>  $requete */
    #[DataProvider('requetesDuBail')]
    public function test_ac2_la_validation_du_bail_suit_la_borne_du_catalogue(string $requete): void
    {
        $regles = ['early_termination_penalty_months' => (new $requete)->rules()['early_termination_penalty_months']];
        $passe = fn (int $mois) => Validator::make(['early_termination_penalty_months' => $mois], $regles)->passes();

        $this->assertTrue($passe($this->max()), 'la borne haute du catalogue est admise');
        $this->assertFalse($passe($this->max() + 1), 'au-delà de la borne du catalogue, refusé');
        $this->assertTrue($passe($this->min()), 'la borne basse du catalogue est admise');
        $this->assertFalse($passe($this->min() - 1), 'sous la borne du catalogue, refusé');
    }

    // ── AC3 : le 0 a le même sens partout ────────────────────────────────────────────────────────

    public function test_ac3_une_agence_regle_aucune_indemnite_et_le_bail_neuf_comme_la_resiliation_le_suivent(): void
    {
        $this->actingAsApi($this->admin);
        $this->postJson('/api/settings', ['key' => self::CLE, 'value' => ['value' => 0], 'scope' => 'agency'])
            ->assertCreated();

        $this->assertSame(['value' => 0, 'source' => 'agency'], $this->prefill());

        $service = app(EarlyTerminationService::class);
        $this->assertSame(0, $service->resolvePenaltyMonths($this->agence->id));

        // Un bail antérieur (colonne nulle) exécute le réglage de l'agence ; un bail figé à 0 exécute 0.
        foreach ([null, 0] as $fige) {
            $bail = Lease::factory()->create([
                'agency_id' => $this->agence->id, 'property_id' => $this->bien->id,
                'monthly_rent' => 300_000, 'end_date' => now()->addYear()->toDateString(),
                'early_termination_penalty_months' => $fige,
            ]);
            $this->assertSame(0.0, $service->computePenalty($bail, now()->addMonth()), 'colonne '.var_export($fige, true));
        }
    }

    // ── AC4 : au-dessus de la borne, 422 ; l'écran lit la borne neuve ────────────────────────────

    public function test_ac4_un_reglage_au_dessus_de_la_borne_est_refuse_et_l_ecran_lit_la_borne(): void
    {
        $this->actingAsApi($this->admin);
        $this->postJson('/api/settings', ['key' => self::CLE, 'value' => ['value' => $this->max() + 1], 'scope' => 'agency'])
            ->assertUnprocessable()->assertJsonValidationErrors(['value']);
        $this->assertFalse(Setting::query()->where('key', self::CLE)->exists());

        $reglage = collect($this->getJson('/api/settings/lease')->assertOk()->json('data.settings'))
            ->firstWhere('key', self::CLE);
        $this->assertSame(0, $reglage['min']);
        $this->assertFalse($reglage['min_exclusive']);
        $this->assertSame(12, $reglage['max']);
    }

    // ── AC5 : une ligne écrite avant la règle se lit dans la borne ───────────────────────────────

    public function test_ac5_une_ligne_hors_borne_ecrite_avant_la_regle_se_lit_dans_la_borne(): void
    {
        $this->ligneBrute($this->max() + 6);

        $this->assertSame($this->max(), app(EarlyTerminationService::class)->resolvePenaltyMonths($this->agence->id));
        $this->assertSame(['value' => $this->max(), 'source' => 'agency'], $this->prefill());

        // La résiliation d'un bail antérieur (colonne nulle) aboutit, à la borne : ni 18 mois, ni une erreur.
        $bail = Lease::factory()->create([
            'agency_id' => $this->agence->id, 'property_id' => $this->bien->id,
            'monthly_rent' => 100_000, 'end_date' => now()->addYears(3)->toDateString(),
            'early_termination_penalty_months' => null,
        ]);
        $this->assertSame(100_000.0 * $this->max(), app(EarlyTerminationService::class)->computePenalty($bail, now()->addMonth()));
    }
}
