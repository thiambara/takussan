<?php

namespace Tests\Feature\Tags;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-666 (P03.03) — une étiquette CRM ne se lit que depuis l'agence du PERSONNEL dont un client la
 * porte, en liste comme en fiche. `GET /api/tags` n'est gardé que par `auth:sanctum` : avant, un
 * compte auto-inscrit listait et ouvrait les étiquettes CRM de toutes les agences, et un bailleur
 * recevait celles de son agence (`agency_id` est aussi le sien).
 */
class TagCrmAgencyScopeTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agenceA;

    private Tag $crmA;

    private Tag $crmB;

    private Tag $equipement;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agenceA = Agency::factory()->create();
        $agenceB = Agency::factory()->create();

        $this->crmA = Tag::factory()->create(['name' => 'Client fidèle A', 'type' => TagType::Crm]);
        $this->crmB = Tag::factory()->create(['name' => 'Mauvais payeur B', 'type' => TagType::Crm]);
        $this->equipement = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);

        Customer::factory()->create(['agency_id' => $this->agenceA->id])->tags()->attach($this->crmA);
        Customer::factory()->create(['agency_id' => $agenceB->id])->tags()->attach($this->crmB);
    }

    private function membre(string $role): User
    {
        $user = User::factory()->create(['agency_id' => $this->agenceA->id]);
        $this->materializeRoleProfile($user, $role, $this->agenceA);

        return $user;
    }

    /** @return list<string> */
    private function nomsListes(string $query = ''): array
    {
        return collect($this->getJson('/api/tags?per_page=100'.$query)->assertOk()->json('data'))
            ->pluck('name')->sort()->values()->all();
    }

    public function test_le_personnel_ne_lit_que_les_etiquettes_crm_de_son_agence(): void
    {
        Sanctum::actingAs($this->membre('agent'));

        $this->assertSame(['Client fidèle A'], $this->nomsListes('&filter[type]=crm'));
        $this->assertSame(['Client fidèle A', 'Piscine'], $this->nomsListes());
        $this->getJson("/api/tags/{$this->crmA->id}")->assertOk();
        $this->getJson("/api/tags/{$this->crmB->id}")->assertNotFound();
    }

    public function test_un_compte_sans_agence_ne_lit_aucune_etiquette_crm(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->assertSame([], $this->nomsListes('&filter[type]=crm'));
        $this->assertSame(['Piscine'], $this->nomsListes());
        $this->getJson("/api/tags/{$this->crmA->id}")->assertNotFound();
        $this->getJson("/api/tags/{$this->crmB->id}")->assertNotFound();
        $this->getJson("/api/tags/{$this->equipement->id}")->assertOk();
    }

    public function test_un_bailleur_de_l_agence_n_est_pas_du_personnel(): void
    {
        Sanctum::actingAs($this->membre('owner'));

        $this->assertSame([], $this->nomsListes('&filter[type]=crm'));
        $this->getJson("/api/tags/{$this->crmA->id}")->assertNotFound();
    }

    public function test_la_console_lit_toutes_les_etiquettes_crm(): void
    {
        $operateur = User::factory()->create();
        $this->materializeRoleProfile($operateur, 'super_admin');
        Sanctum::actingAs($operateur);

        $this->assertSame(['Client fidèle A', 'Mauvais payeur B'], $this->nomsListes('&filter[type]=crm'));
        $this->getJson("/api/tags/{$this->crmB->id}")->assertOk();
    }
}
