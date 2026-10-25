<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-997 (P15.06, P50.01 ; ADR-0036, amendement du 2026-10-19) — le bailleur se désigne à la saisie
 * du bien. Le personnel qui saisit le bien d'un bailleur actif de son agence le fait AU NOM de ce
 * bailleur : `properties.user_id` le désigne, le bail en hérite, le bailleur voit son bien et en
 * est prévenu. Sans désignation, l'agence garde le bien en propre (Q1).
 */
class PropertyOwnerDesignationTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $b;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = Agency::factory()->create(['moderation_required' => false]);
        $this->agent = $this->agencyAgent($this->agency);
        $this->b = User::factory()->withOwnerProfile($this->agency)->create();
    }

    /** @return array<string, mixed> */
    private function bien(array $extra = []): array
    {
        return $extra + [
            'title' => 'Villa de B aux Almadies',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'rent_period' => 'monthly',
            'price' => 300_000,
        ];
    }

    private function notificationsDeDesignation(User $user): int
    {
        return AppNotification::query()->where('user_id', $user->id)->where('code', 'property.assigned_to_owner')->count();
    }

    public function test_ac1_l_agent_saisit_le_bien_de_b_qui_le_voit_et_en_est_prevenu(): void
    {
        $id = $this->actingAsApi($this->agent)
            ->postJson('/api/properties', $this->bien(['owner_id' => $this->b->id]))
            ->assertCreated()
            ->json('data.id');

        $this->assertSame($this->b->id, (int) Property::query()->findOrFail($id)->user_id);

        $this->actingAsApi($this->b)->getJson('/api/properties')->assertOk()->assertJsonPath('meta.total', 1);
        $this->actingAsApi($this->b)->getJson("/api/properties/{$id}")->assertOk();

        $avis = AppNotification::query()->where('user_id', $this->b->id)->where('code', 'property.assigned_to_owner')->sole();
        $this->assertSame('property', $avis->target['kind'] ?? null);
        $this->assertSame($id, $avis->target['id'] ?? null);
        $this->assertSame('Villa de B aux Almadies', $avis->params['property'] ?? null);
        $this->assertSame(0, $this->notificationsDeDesignation($this->agent));
    }

    /** @return iterable<string, array{0: callable(Agency): int}> */
    public static function titulairesRefuses(): iterable
    {
        yield 'bailleur d\'une autre agence' => [fn (Agency $a): int => User::factory()->withOwnerProfile(Agency::factory()->create())->create()->id];
        yield 'profil draft' => [fn (Agency $a): int => OwnerProfile::factory()->create(['agency_id' => $a->id, 'status' => 'draft'])->user_id];
        yield 'profil inactive' => [fn (Agency $a): int => OwnerProfile::factory()->inactive()->create(['agency_id' => $a->id])->user_id];
        yield 'profil blocked' => [fn (Agency $a): int => OwnerProfile::factory()->blocked()->create(['agency_id' => $a->id])->user_id];
        yield 'agent de l\'agence' => [fn (Agency $a): int => User::factory()->withAgentProfile($a)->create()->id];
        yield 'compte inexistant' => [fn (Agency $a): int => 999_999];
    }

    /** @param  callable(Agency): int  $titulaire */
    #[DataProvider('titulairesRefuses')]
    public function test_ac2_un_titulaire_hors_des_bailleurs_actifs_de_l_agence_est_refuse(callable $titulaire): void
    {
        $ownerId = $titulaire($this->agency);

        $this->actingAsApi($this->agent)
            ->postJson('/api/properties', $this->bien(['owner_id' => $ownerId]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'property.owner_not_in_agency');

        $this->assertSame(0, Property::query()->count());
        $this->assertSame(0, AppNotification::query()->where('code', 'property.assigned_to_owner')->count());
    }

    public function test_ac2_un_bailleur_qui_est_aussi_personnel_de_l_agence_n_est_pas_designe(): void
    {
        $double = User::factory()->withOwnerProfile($this->agency)->withAgentProfile($this->agency)->create();

        $this->actingAsApi($this->agent)
            ->postJson('/api/properties', $this->bien(['owner_id' => $double->id]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'property.owner_not_in_agency');
    }

    public function test_ac3_une_proposition_ne_designe_pas_un_autre_bailleur(): void
    {
        $autre = User::factory()->withOwnerProfile($this->agency)->create();

        $this->actingAsApi($this->b)
            ->postJson('/api/properties', $this->bien(['owner_id' => $autre->id]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'property.owner_designation_forbidden');
        $this->assertSame(0, Property::query()->count());

        $id = $this->actingAsApi($this->b)->postJson('/api/properties', $this->bien())->assertCreated()->json('data.id');
        $this->assertSame($this->b->id, (int) Property::query()->findOrFail($id)->user_id);
    }

    public function test_ac4_le_bail_designe_b_quel_que_soit_le_landlord_id_envoye(): void
    {
        $id = $this->actingAsApi($this->agent)
            ->postJson('/api/properties', $this->bien(['owner_id' => $this->b->id]))
            ->assertCreated()
            ->json('data.id');
        $locataire = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id]);

        $leaseId = $this->actingAsApi($this->agent)->postJson('/api/leases', [
            'property_id' => $id,
            'tenant_id' => $locataire->id,
            'landlord_id' => $this->agent->id,
            'type' => 'residential_rent',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 300_000,
        ])->assertCreated()->json('data.id');

        $this->assertSame($this->b->id, (int) Lease::query()->findOrFail($leaseId)->landlord_id);
        $this->actingAsApi($this->b)->getJson('/api/leases')->assertOk()->assertJsonPath('meta.total', 1);
    }

    public function test_ac8_sans_designation_l_agence_garde_le_bien_au_nom_de_l_auteur(): void
    {
        $id = $this->actingAsApi($this->agent)->postJson('/api/properties', $this->bien())->assertCreated()->json('data.id');

        $this->assertSame($this->agent->id, (int) Property::query()->findOrFail($id)->user_id);
        $this->assertSame(0, Activity::query()->where('event', 'owner_designated')->count());
        $this->assertSame(0, AppNotification::query()->where('code', 'property.assigned_to_owner')->count());
    }

    public function test_ac9_une_agence_individual_refuse_la_designation(): void
    {
        $independant = Agency::factory()->individual()->create(['moderation_required' => false]);
        $hote = User::factory()->withTwoFactor()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $hote->id, 'agency_id' => $independant->id]);
        $bailleur = User::factory()->withOwnerProfile($independant)->create();

        $this->actingAsApi($hote)
            ->postJson('/api/properties', $this->bien(['owner_id' => $bailleur->id]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'property.owner_designation_forbidden');
        $this->assertSame(0, Property::query()->count());

        $id = $this->actingAsApi($hote)->postJson('/api/properties', $this->bien())->assertCreated()->json('data.id');
        $this->assertSame($hote->id, (int) Property::query()->findOrFail($id)->user_id);
    }

    public function test_ac10_la_designation_est_journalisee_sans_ligne_qui_reecrirait_le_titulaire(): void
    {
        $id = $this->actingAsApi($this->agent)
            ->postJson('/api/properties', $this->bien(['owner_id' => $this->b->id]))
            ->assertCreated()
            ->json('data.id');

        $ligne = Activity::query()->where('log_name', 'Property')->where('event', 'owner_designated')->sole();
        $this->assertSame($id, (int) $ligne->subject_id);
        $this->assertSame($this->agent->id, (int) $ligne->causer_id);
        $this->assertSame($this->b->id, (int) $ligne->properties['owner_id']);

        $reecritures = Activity::query()->where('log_name', 'Property')->where('subject_id', $id)->where('event', 'updated')->get()
            ->filter(fn (Activity $a): bool => array_key_exists('user_id', (array) ($a->properties['attributes'] ?? [])));
        $this->assertCount(0, $reecritures);
    }
}
