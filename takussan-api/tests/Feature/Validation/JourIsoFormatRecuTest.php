<?php

namespace Tests\Feature\Validation;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\CommissionEntry;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyUnavailability;
use App\Models\User;
use App\Rules\JourIso;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsBookingStakeholders;

/**
 * TCK-2768 (r1 de la vérification de 7981e617d) — `date_format:Y-m-d` refuse les formes relues de travers, mais
 * admet TOUTE année à quatre chiffres : l'an 1, 1969, 9999. Mesuré sur 7981e617d : une indisponibilité du
 * 0001-01-01 → 201, écrite telle quelle. Chaque `date_format:Y-m-d` porte donc aussi {@see JourIso}
 * (garde : `InstantRecuConvertiTest::test_aucune_date_recue_n_est_nue`). Ici, par HTTP, les écrivains où
 * l'année s'écrivait sans plancher (indisponibilité) ou sans plafond (offre, pièce KYC), et le solde de
 * commissions, où elle atteignait le service.
 */
class JourIsoFormatRecuTest extends ApiTestCase
{
    use BuildsBookingStakeholders;
    use RefreshDatabase;

    /** @return array<string, array{0: string}> */
    public static function anneesHorsBornes(): array
    {
        return [
            'l’an 1' => ['0001-01-01'],
            'la veille du plancher' => ['1969-12-31'],
        ];
    }

    #[DataProvider('anneesHorsBornes')]
    public function test_une_indisponibilite_hors_des_annees_est_refusee(string $jour): void
    {
        Notification::fake();
        $this->buildStakeholders();
        Sanctum::actingAs($this->landlord);

        $corps = fn (string $debut): array => ['starts_on' => $debut, 'ends_on' => now()->addDays(3)->toDateString(), 'reason' => 'Travaux'];

        $this->postJson("/api/properties/{$this->property->id}/unavailabilities", $corps($jour))
            ->assertUnprocessable()->assertJsonValidationErrors(['starts_on']);
        $this->assertSame(0, PropertyUnavailability::query()->count());

        $debut = now()->addDay()->toDateString();
        $this->postJson("/api/properties/{$this->property->id}/unavailabilities", $corps($debut))
            ->assertCreated()->assertJsonPath('data.starts_on', $debut);
    }

    #[DataProvider('anneesHorsBornes')]
    public function test_un_versement_de_commission_hors_des_annees_est_refuse(string $jour): void
    {
        $agence = Agency::factory()->create();
        $agent = $this->agencyAgent($agence);
        $ligne = CommissionEntry::factory()->create([
            'agency_id' => $agence->id,
            'lease_id' => Lease::factory()->create(['agency_id' => $agence->id])->id,
            'beneficiary_id' => $agent->id,
            'amount' => 90_000,
        ]);
        $this->actingWithStepUp($this->agencyAdmin($agence));

        // Le solde (`settle`) n'a pas le plancher de `mark-paid` (`after_or_equal:<jour où la ligne est née>`).
        // Mesuré sur 7981e617d : l'an 1 n'y était pas ÉCRIT (le service le refuse par
        // `commission.paid_before_earned`, `earned_at` étant NOT NULL), mais il passait la validation et
        // atteignait le service. Il est désormais refusé à la validation, sur `paid_at`, comme toute date reçue.
        $this->postJson('/api/commissions/settle', [
            'beneficiary_id' => $agent->id, 'entry_ids' => [$ligne->id], 'payment_method' => 'cash', 'paid_at' => $jour,
        ])->assertUnprocessable()->assertJsonValidationErrors(['paid_at']);
        $this->assertSame(CommissionEntryStatus::Due, $ligne->fresh()->status);
    }

    /** @return array<string, array{0: string}> */
    public static function anneesSansPlafond(): array
    {
        return [
            'l’an 9999' => ['9999-12-31'],
            'le lendemain du plafond' => ['2200-01-01'],
        ];
    }

    #[DataProvider('anneesSansPlafond')]
    public function test_une_offre_valable_au_dela_du_plafond_est_refusee(string $jour): void
    {
        $bien = Property::factory()->published()->create([
            'price' => 121_000_000, 'currency' => Currency::XOF, 'contract_type' => ContractType::Sale, 'rent_period' => null,
        ]);
        Sanctum::actingAs(User::factory()->create());

        $corps = fn (string $echeance): array => ['offer_amount' => 110_000_000, 'offer_expires_at' => $echeance, 'terms_accepted' => true];

        $this->postJson("/api/public/properties/{$bien->slug}/booking-request", $corps($jour))
            ->assertUnprocessable()->assertJsonValidationErrors(['offer_expires_at']);
        $this->assertSame(0, Booking::query()->count());

        $echeance = now()->addDays(7)->toDateString();
        $this->postJson("/api/public/properties/{$bien->slug}/booking-request", $corps($echeance))->assertCreated();
        $this->assertSame($echeance, Booking::query()->sole()->metadata['offer_expires_at']);
    }

    #[DataProvider('anneesSansPlafond')]
    public function test_une_piece_kyc_valable_au_dela_du_plafond_est_refusee(string $jour): void
    {
        Storage::fake();
        $agence = Agency::factory()->create(['kind' => AgencyKind::Standard, 'rccm' => 'SN-DKR-2010-A-0001', 'ninea' => '001234567']);
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        $piece = fn (string $echeance) => $this->post("/api/agencies/{$agence->id}/kyc/documents", [
            'document_type' => 'director_id',
            'document' => UploadedFile::fake()->create('director_id.pdf', 20, 'application/pdf'),
            'expires_at' => $echeance,
        ], ['Accept' => 'application/json']);

        $piece($jour)->assertUnprocessable()->assertJsonValidationErrors(['expires_at']);
        $piece(now()->addYear()->toDateString())->assertSuccessful();
    }
}
