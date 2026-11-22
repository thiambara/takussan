<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\ApiTestCase;

/**
 * TCK-2855 — « Ma journée » de l'agent : sous ses chiffres, « 3 sans photo » et « 310 000 F à venir ».
 * `properties_without_photo` lit les biens suivis de `properties_managed` (propriétaire ou collaborateur
 * `agent|manager`, hors portefeuille sorti) ; `commissions_upcoming`, SES lignes `due` du grand livre
 * dans l'agence active.
 */
class AgentDayMetricsTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->agent = $this->apiActingAsRole('agent', ['agency' => $this->agency]);
    }

    private function photo(Property $bien): void
    {
        DB::table('media')->insert([
            'model_type' => Property::class, 'model_id' => $bien->id, 'uuid' => (string) Str::uuid(),
            'collection_name' => 'photos', 'name' => 'p', 'file_name' => "p{$bien->id}.jpg", 'mime_type' => 'image/jpeg',
            'disk' => 'public', 'conversions_disk' => 'public', 'size' => 1, 'manipulations' => '[]',
            'custom_properties' => '[]', 'generated_conversions' => '[]', 'responsive_images' => '[]', 'order_column' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function plan(Property $bien): void
    {
        DB::table('media')->insert([
            'model_type' => Property::class, 'model_id' => $bien->id, 'uuid' => (string) Str::uuid(),
            'collection_name' => 'plans', 'name' => 'plan', 'file_name' => "plan{$bien->id}.pdf", 'mime_type' => 'application/pdf',
            'disk' => 'public', 'conversions_disk' => 'public', 'size' => 1, 'manipulations' => '[]',
            'custom_properties' => '[]', 'generated_conversions' => '[]', 'responsive_images' => '[]', 'order_column' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    /** @return array<string, mixed> */
    private function metrics(): array
    {
        return $this->apiGet('/api/dashboard/me')->assertOk()->assertJsonPath('data.role', 'agent')->json('data.metrics');
    }

    /** AC1 — 12 biens suivis dont 3 sans photo : 3. */
    public function test_les_biens_suivis_sans_photo(): void
    {
        $owned = Property::factory()->count(11)->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->agent->id, 'status' => PropertyStatus::Available,
        ])->all();
        foreach (array_slice($owned, 0, 9) as $bien) {
            $this->photo($bien);
        }
        // Un bien sans photo mais avec un plan : un plan n'est pas une photo.
        $this->plan($owned[9]);

        // Un bien suivi en collaborateur, sans photo : il compte.
        $collabore = Property::factory()->create(['agency_id' => $this->agency->id, 'status' => PropertyStatus::Available]);
        PropertyCollaborator::create([
            'property_id' => $collabore->id, 'user_id' => $this->agent->id,
            'role' => CollaboratorRole::Agent->value, 'invited_at' => now(),
        ]);

        // Ne comptent pas : archivé (hors portefeuille), d'un collègue, d'une autre agence.
        Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->agent->id, 'status' => PropertyStatus::Archived]);
        Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => User::factory()->create()->id]);
        $ailleurs = Agency::factory()->create();
        Property::factory()->create(['agency_id' => $ailleurs->id, 'user_id' => $this->agent->id]);

        $metrics = $this->metrics();

        $this->assertSame(12, $metrics['properties_managed']);
        $this->assertSame(3, $metrics['properties_without_photo']);
    }

    /** AC2 — 310 000 F dus non versés, 90 000 F versés : 310 000. */
    public function test_les_commissions_a_venir(): void
    {
        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->agent->id]);
        $ligne = function (User $beneficiaire, int $montant, CommissionEntryStatus $statut, ?Agency $agence = null) use ($bien): void {
            $agence ??= $this->agency;
            $bail = Lease::factory()->create(['property_id' => $bien->id, 'agency_id' => $agence->id]);
            CommissionEntry::factory()->create([
                'agency_id' => $agence->id, 'lease_id' => $bail->id, 'beneficiary_id' => $beneficiaire->id,
                'amount' => $montant, 'status' => $statut, 'earned_at' => now()->subMonths(2),
                'paid_at' => $statut === CommissionEntryStatus::Paid ? now()->subMonth() : null,
                'cancelled_at' => $statut === CommissionEntryStatus::Cancelled ? now()->subMonth() : null,
            ]);
        };

        // Dues, même gagnées hors du mois : 200 000 + 110 000.
        $ligne($this->agent, 200_000, CommissionEntryStatus::Due);
        $ligne($this->agent, 110_000, CommissionEntryStatus::Due);
        // Ne comptent pas : versée, annulée, due à un collègue, due dans une autre agence.
        $ligne($this->agent, 90_000, CommissionEntryStatus::Paid);
        $ligne($this->agent, 50_000, CommissionEntryStatus::Cancelled);
        $ligne(User::factory()->create(), 40_000, CommissionEntryStatus::Due);
        $ailleurs = Agency::factory()->create();
        $ligne($this->agent, 70_000, CommissionEntryStatus::Due, $ailleurs);

        $metrics = $this->metrics();

        $this->assertEquals(310_000.0, $metrics['commissions_upcoming']);
        $this->assertSame(310_000.0, (float) $this->apiGet('/api/dashboard/agent')->assertOk()->json('data.finance.commissions_upcoming'));
    }

    public function test_sans_rien_les_deux_chiffres_valent_zero(): void
    {
        $metrics = $this->metrics();

        $this->assertSame(0, $metrics['properties_without_photo']);
        $this->assertEquals(0.0, $metrics['commissions_upcoming']);
    }
}
