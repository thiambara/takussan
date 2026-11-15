<?php

namespace Tests\Feature\Validation;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\DocumentType;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2768 — une date (un JOUR) mal formée est refusée (422) au lieu d'être relue comme un autre jour, par
 * HTTP — middleware compris. Mesuré sur HEAD avant la règle (d23dde767, 2026-11-13) : `date` laissait passer
 * les formes ci-dessous, et un bail, une facture, une pièce ou une période de loyer s'écrivait au mauvais jour
 * (« 99999-01-01 » → 2009-01-01, « 12/11/2026 » → 2026-12-11).
 *
 * La forme est posée sur CHAQUE date reçue : c'est `InstantRecuConvertiTest::test_aucune_date_recue_n_est_nue`
 * qui le tient, et `Tests\Unit\Rules\JourIsoTest` qui juge la règle forme par forme. Ici, quatre écrivains
 * SANS borne relative (là où la forme relue s'écrivait), une lecture au jour (le calendrier), puis les bornes
 * qui gardent l'instant (journal, `DateBoundaryFilter`, `RangeFilter` sur un horodatage).
 */
class JourIsoRecuTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    /** @return array<string, array{0: string}> */
    public static function formesRefusees(): array
    {
        return [
            'année à cinq chiffres (relue 2009-01-01)' => ['99999-01-01'],
            'année à zéros de tête (l’an 99)' => ['0099-01-01'],
            'jour/mois/année (relu le 11 décembre)' => ['12/11/2026'],
            'un instant sur un jour' => ['2026-11-12T10:00:00Z'],
        ];
    }

    /** @return array{0: User, 1: array<string, mixed>} */
    private function bail(): array
    {
        $bailleur = User::factory()->create();
        $bien = Property::factory()->create(['user_id' => $bailleur->id]);
        $locataire = Customer::factory()->create(['added_by_id' => $bailleur->id]);

        return [$bailleur, [
            'property_id' => $bien->id, 'tenant_id' => $locataire->id, 'type' => 'residential_rent',
            'monthly_rent' => 400000, 'currency' => 'XOF',
        ]];
    }

    #[DataProvider('formesRefusees')]
    public function test_ac1_le_debut_d_un_bail_relu_de_travers_est_refuse(string $forme): void
    {
        [$bailleur, $corps] = $this->bail();
        Sanctum::actingAs($bailleur);

        $this->postJson('/api/leases', $corps + ['start_date' => $forme])
            ->assertUnprocessable()->assertJsonValidationErrors(['start_date']);
        $this->assertSame(0, Lease::query()->count());
    }

    public function test_ac3_le_jour_du_bail_est_celui_envoye(): void
    {
        [$bailleur, $corps] = $this->bail();
        Sanctum::actingAs($bailleur);

        $this->postJson('/api/leases', $corps + ['start_date' => '2026-11-12', 'end_date' => '2125-11-11'])->assertCreated();

        $bail = Lease::query()->sole();
        $this->assertSame('2026-11-12', $bail->start_date->toDateString());
        $this->assertSame('2125-11-11', $bail->end_date->toDateString(), 'Un bail long (emphytéotique) passe sous le plafond (2199).');
    }

    #[DataProvider('formesRefusees')]
    public function test_ac1_la_date_d_une_facture_relue_de_travers_est_refusee(string $forme): void
    {
        $agent = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        $client = Customer::factory()->create(['added_by_id' => $agent->id]);
        Sanctum::actingAs($agent);

        $this->postJson('/api/invoices', ['customer_id' => $client->id, 'issue_date' => $forme, 'subtotal' => 100000])
            ->assertUnprocessable()->assertJsonValidationErrors(['issue_date']);
        $this->assertSame(0, Invoice::query()->count());

        $this->postJson('/api/invoices', ['customer_id' => $client->id, 'issue_date' => '2026-11-12', 'subtotal' => 100000])->assertCreated();
        $this->assertSame('2026-11-12', Invoice::query()->sole()->issue_date->toDateString());
    }

    #[DataProvider('formesRefusees')]
    public function test_ac1_l_echeance_d_une_piece_relue_de_travers_est_refusee(string $forme): void
    {
        $proprietaire = User::factory()->create();
        $bien = Property::factory()->create(['user_id' => $proprietaire->id]);
        Sanctum::actingAs($proprietaire);

        $corps = fn (string $jour): array => [
            'documentable_type' => 'property', 'documentable_id' => $bien->id, 'name' => 'Assurance',
            'type' => DocumentType::Other->value, 'expiry_date' => $jour,
            'file' => UploadedFile::fake()->create('assurance.pdf', 100, 'application/pdf'),
        ];

        $this->postJson('/api/documents', $corps($forme))->assertUnprocessable()->assertJsonValidationErrors(['expiry_date']);
        $this->assertDatabaseCount('documents', 0);

        $this->postJson('/api/documents', $corps('2027-03-31'))->assertCreated();
        $this->assertDatabaseHas('documents', ['expiry_date' => '2027-03-31']);
    }

    #[DataProvider('formesRefusees')]
    public function test_ac1_la_periode_d_un_loyer_relue_de_travers_est_refusee(string $forme): void
    {
        $bailleur = User::factory()->create();
        $bail = Lease::factory()->active()->create(['landlord_id' => $bailleur->id]);
        Sanctum::actingAs($bailleur);

        $corps = fn (string $debut): array => [
            'amount' => 40000, 'payment_type' => 'charges', 'period_start' => $debut, 'period_end' => '2027-01-31', 'due_date' => '2027-01-05',
        ];

        $this->postJson("/api/leases/{$bail->id}/payments", $corps($forme))
            ->assertUnprocessable()->assertJsonValidationErrors(['period_start']);
        $this->assertSame(0, LeasePayment::query()->where('payment_type', 'charges')->count());

        $this->postJson("/api/leases/{$bail->id}/payments", $corps('2027-01-01'))->assertCreated();
        $this->assertSame('2027-01-01', LeasePayment::query()->where('payment_type', 'charges')->sole()->period_start->toDateString());
    }

    public function test_ac1_une_lecture_au_jour_refuse_un_jour_relu_de_travers(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/calendar?start_date=12/11/2026&end_date=2026-12-20')
            ->assertUnprocessable()->assertJsonValidationErrors(['start_date']);
        $this->getJson('/api/calendar?start_date=2026-12-01&end_date=2026-12-20')->assertOk();
    }

    /** AC2 — les bornes du journal (et `DateBoundaryFilter`) gardent l'instant, et refusent la forme relue. */
    public function test_ac2_les_bornes_du_journal_gardent_l_instant(): void
    {
        $this->actingAsRole('super_admin');

        foreach (['99999-01-01', '12/11/2026'] as $forme) {
            $this->getJson('/api/activity-log?filter[date_from]='.rawurlencode($forme))
                ->assertUnprocessable()->assertJsonValidationErrors(['filter.date_from']);
            $this->getJson('/api/activity-log?from='.rawurlencode($forme))
                ->assertUnprocessable()->assertJsonValidationErrors(['from']);
        }

        $this->getJson('/api/activity-log?filter[date_from]='.rawurlencode('2026-11-12 10:00:00'))->assertOk();
        $this->getJson('/api/activity-log?filter[date_from]=2026-11-12&from='.rawurlencode('2026-11-12T10:00:00Z'))->assertOk();
    }

    /** AC2 — `published_after` garde l'instant (le front envoie `toISOString()`), et refuse la forme relue. */
    public function test_ac2_published_after_refuse_la_forme_relue(): void
    {
        foreach (['99999-01-01', '12/11/2026'] as $forme) {
            $this->getJson('/api/public/properties/search?published_after='.rawurlencode($forme))
                ->assertUnprocessable()->assertJsonValidationErrors(['published_after']);
        }
    }

    /** AC1/AC2 — `RangeFilter` suit le cast : un jour sur une colonne `date`, un instant admis sur un horodatage. */
    public function test_range_filter_suit_le_cast_de_la_colonne(): void
    {
        $this->actingAsRole('super_admin');

        foreach (['12/11/2026', '2026-11-12T10:00:00Z'] as $forme) {
            $this->getJson('/api/admin/payouts?filter[period_start_min]='.rawurlencode($forme))
                ->assertUnprocessable()->assertJsonValidationErrors(['filter.period_start_min']);
        }
        $this->getJson('/api/admin/payouts?filter[period_start_min]=2026-11-01')->assertOk();

        // Un horodatage (`property_contact_leads.created_at`) : l'instant reste admis, la forme relue non.
        $agence = $this->agence();
        Sanctum::actingAs($this->personnel($agence));
        $this->getJson('/api/contact-leads?filter[created_at_min]='.rawurlencode('2026-11-03 10:00'))->assertOk();
        $this->getJson('/api/contact-leads?filter[created_at_max]=2026-11-06')->assertOk();
        $this->getJson('/api/contact-leads?filter[created_at_min]='.rawurlencode('12/11/2026'))
            ->assertUnprocessable()->assertJsonValidationErrors(['filter.created_at_min']);
    }
}
