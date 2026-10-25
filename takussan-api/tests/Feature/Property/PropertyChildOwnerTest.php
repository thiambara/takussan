<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-997 (P50.03 ; Q3, Q4 ; ADR-0036, amendement du 2026-10-19) — le titulaire d'un lot se fixe à
 * sa création : sous le bien d'un bailleur, il naît au nom de ce bailleur. Le rattachement par `PUT`
 * ne réécrit jamais `user_id` : un lot tenu par un autre (bailleur ou personnel) est refusé.
 *
 * Créer un lot sous un bien, c'est le rattacher : il faut `update` sur le parent, comme au `PUT`
 * (`PropertyPolicy::updateParent`). L'agent du rôle système n'a que `properties.update_own` : sur le
 * bien d'un bailleur, il lui faut `properties.update_any`.
 */
class PropertyChildOwnerTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $admin;

    private User $b;

    private Property $bienDeB;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = Agency::factory()->create(['moderation_required' => false]);
        $this->agent = $this->agentWith($this->agency, Capability::PropertiesUpdateAny);
        $this->admin = $this->agencyAdmin($this->agency);
        $this->b = User::factory()->withOwnerProfile($this->agency)->create();
        $this->bienDeB = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->b->id]);
    }

    /** @return array<string, mixed> */
    private function lot(array $extra = []): array
    {
        return $extra + [
            'title' => 'Appartement A1',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'rent_period' => 'monthly',
            'price' => 150_000,
        ];
    }

    public function test_ac7_le_lot_cree_sous_le_bien_de_b_est_a_b_qui_l_ouvre(): void
    {
        $lot = $this->actingAsApi($this->agent)
            ->postJson('/api/properties', $this->lot(['parent_id' => $this->bienDeB->id]))
            ->assertCreated()
            ->json('data.id');

        $enBase = Property::query()->findOrFail($lot);
        $this->assertSame($this->b->id, (int) $enBase->user_id);
        $this->assertSame($this->bienDeB->id, (int) $enBase->parent_id);

        $this->actingAsApi($this->b)->getJson("/api/properties/{$lot}")->assertOk();
        $enfants = $this->actingAsApi($this->b)->getJson("/api/properties/{$this->bienDeB->id}/children")->assertOk()->json('data');
        $this->assertContains($lot, array_column($enfants, 'id'));
        $this->assertSame(1, AppNotification::query()->where('user_id', $this->b->id)->where('code', 'property.assigned_to_owner')->count());
    }

    public function test_ac7_un_autre_bailleur_designe_pour_le_lot_est_refuse(): void
    {
        $autre = User::factory()->withOwnerProfile($this->agency)->create();

        $this->actingAsApi($this->agent)
            ->postJson('/api/properties', $this->lot(['parent_id' => $this->bienDeB->id, 'owner_id' => $autre->id]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'property.parent_owner_mismatch');

        $this->assertSame(1, Property::query()->count());
    }

    public function test_ac7_b_lui_meme_designe_pour_son_lot_est_admis(): void
    {
        $lot = $this->actingAsApi($this->agent)
            ->postJson('/api/properties', $this->lot(['parent_id' => $this->bienDeB->id, 'owner_id' => $this->b->id]))
            ->assertCreated()
            ->json('data.id');

        $this->assertSame($this->b->id, (int) Property::query()->findOrFail($lot)->user_id);
    }

    public function test_un_lot_sous_un_bien_garde_par_l_agence_reste_a_son_auteur(): void
    {
        $bienDeLAgence = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->admin->id]);

        $lot = $this->actingAsApi($this->agent)
            ->postJson('/api/properties', $this->lot(['parent_id' => $bienDeLAgence->id]))
            ->assertCreated()
            ->json('data.id');

        $this->assertSame($this->agent->id, (int) Property::query()->findOrFail($lot)->user_id);
        $this->assertSame(0, AppNotification::query()->where('code', 'property.assigned_to_owner')->count());
    }

    public function test_un_parent_que_l_auteur_ne_peut_pas_modifier_est_refuse_comme_au_put(): void
    {
        $agentSysteme = $this->agencyAgent($this->agency);

        $this->actingAsApi($agentSysteme)
            ->postJson('/api/properties', $this->lot(['parent_id' => $this->bienDeB->id]))
            ->assertForbidden();

        $this->assertSame(1, Property::query()->count());
    }

    public function test_un_parent_absent_rend_le_meme_refus_qu_un_parent_d_autrui(): void
    {
        $this->actingAsApi($this->agencyAgent($this->agency))
            ->postJson('/api/properties', $this->lot(['parent_id' => 999_999]))
            ->assertForbidden();
    }

    public function test_un_parent_d_une_autre_agence_est_refuse(): void
    {
        $ailleurs = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        $this->apiActingAsRole('super_admin');

        $this->postJson('/api/properties', $this->lot(['agency_id' => $this->agency->id, 'parent_id' => $ailleurs->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('parent_id');
        $this->assertSame(0, Property::query()->where('title', 'Appartement A1')->count());
    }

    public function test_un_lot_au_dela_de_la_profondeur_maximale_est_refuse(): void
    {
        $parent = $this->bienDeB;
        for ($niveau = 2; $niveau <= 4; $niveau++) {
            $parent = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->b->id, 'parent_id' => $parent->id]);
        }

        $this->actingAsApi($this->agent)
            ->postJson('/api/properties', $this->lot(['parent_id' => $parent->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('parent_id');
    }

    /** @return iterable<string, array{0: string}> */
    public static function titulairesDuLot(): iterable
    {
        yield 'un autre bailleur' => ['bailleur'];
        yield 'le personnel' => ['personnel'];
    }

    #[DataProvider('titulairesDuLot')]
    public function test_ac7_rattacher_au_bien_de_b_un_lot_d_un_autre_titulaire_est_refuse(string $titulaire): void
    {
        $tenant = $titulaire === 'bailleur' ? User::factory()->withOwnerProfile($this->agency)->create() : $this->agent;
        $lot = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $tenant->id]);

        $this->actingAsApi($this->admin)
            ->putJson("/api/properties/{$lot->id}", ['parent_id' => $this->bienDeB->id])
            ->assertStatus(422)
            ->assertJsonPath('code', 'property.parent_owner_mismatch');

        $lot->refresh();
        $this->assertNull($lot->parent_id);
        $this->assertSame($tenant->id, (int) $lot->user_id);
    }

    public function test_rattacher_un_lot_de_b_a_son_bien_reste_admis(): void
    {
        $lot = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->b->id]);

        $this->actingAsApi($this->admin)
            ->putJson("/api/properties/{$lot->id}", ['parent_id' => $this->bienDeB->id])
            ->assertOk();

        $this->assertSame($this->bienDeB->id, (int) $lot->refresh()->parent_id);
    }

    public function test_rattacher_un_lot_du_personnel_a_un_bien_garde_par_l_agence_reste_admis(): void
    {
        $bienDeLAgence = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->admin->id]);
        $lot = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->agent->id]);

        $this->actingAsApi($this->admin)
            ->putJson("/api/properties/{$lot->id}", ['parent_id' => $bienDeLAgence->id])
            ->assertOk();

        $this->assertSame($this->agent->id, (int) $lot->refresh()->user_id);
    }
}
