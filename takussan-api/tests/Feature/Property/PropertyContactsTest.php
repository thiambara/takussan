<?php

namespace Tests\Feature\Property;

use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** TCK-633 (lot C, AC12) — trois contacts sur place au plus, joignables, absents de toute ressource. */
class PropertyContactsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create();
        $this->bien = Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => null]);
    }

    /** @return list<array<string, mixed>> */
    private function trois(): array
    {
        return [
            ['label' => 'Gardien', 'phone' => '+221770000701', 'has_whatsapp' => true],
            ['label' => null, 'phone' => '+221770000702', 'has_whatsapp' => false],
            ['label' => 'Voisine', 'phone' => '+221770000703'],
        ];
    }

    public function test_le_schema_et_ses_noms(): void
    {
        $index = DB::table('pg_indexes')->where('tablename', 'property_contacts')->pluck('indexname')->all();
        $this->assertContains('property_contacts_property_position_idx', $index);
        $this->assertTrue(DB::table('information_schema.table_constraints')
            ->where('table_name', 'property_contacts')->where('constraint_name', 'property_contacts_property_fk')->exists());
    }

    public function test_remplace_la_liste_et_la_relit_dans_l_ordre(): void
    {
        Sanctum::actingAs($this->owner);

        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => $this->trois()])
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.label', 'Gardien')
            ->assertJsonPath('data.0.has_whatsapp', true)
            ->assertJsonPath('data.1.label', null)
            ->assertJsonPath('data.2.phone', '+221770000703')
            ->assertJsonPath('data.2.has_whatsapp', false)
            ->assertJsonPath('data.2.position', 2);

        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => [['phone' => '+221770000704']]])
            ->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame(1, $this->bien->contacts()->count());

        $this->getJson("/api/properties/{$this->bien->id}/contacts")->assertOk()->assertJsonPath('data.0.phone', '+221770000704');

        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => []])->assertOk()->assertJsonCount(0, 'data');
        $this->assertSame(0, $this->bien->contacts()->count());
    }

    public function test_plafond_de_trois(): void
    {
        Sanctum::actingAs($this->owner);
        $quatre = [...$this->trois(), ['phone' => '+221770000704']];

        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => $quatre])
            ->assertUnprocessable()->assertJsonValidationErrors(['contacts']);
        $this->assertSame(0, $this->bien->contacts()->count());
    }

    public function test_format_joignable(): void
    {
        Sanctum::actingAs($this->owner);

        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => [['phone' => '+330612345678']]])
            ->assertUnprocessable()->assertJsonValidationErrors(['contacts.0.phone']);
        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => [['phone' => '770000701']]])
            ->assertUnprocessable()->assertJsonValidationErrors(['contacts.0.phone']);
        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => [['phone' => '+221770000701', 'label' => str_repeat('a', 61)]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['contacts.0.label']);
    }

    public function test_un_tiers_n_y_touche_pas(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/properties/{$this->bien->id}/contacts")->assertForbidden();
        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => $this->trois()])->assertForbidden();
        // L'autorisation passe AVANT la validation (TCK-305) : un corps invalide d'un tiers rend 403.
        $this->putJson("/api/properties/{$this->bien->id}/contacts", ['contacts' => 'x'])->assertForbidden();
        $this->assertSame(0, $this->bien->contacts()->count());
    }

    public function test_absents_de_toute_ressource_de_bien(): void
    {
        $this->bien->contacts()->create(['label' => 'Gardien', 'phone' => '+221771112233', 'has_whatsapp' => true, 'position' => 0]);

        $public = $this->getJson("/api/public/properties/{$this->bien->slug}")->assertOk();
        $this->assertStringNotContainsString('771112233', (string) $public->getContent());

        Sanctum::actingAs($this->owner);
        $prive = $this->getJson("/api/properties/{$this->bien->id}")->assertOk();
        $this->assertStringNotContainsString('771112233', (string) $prive->getContent());
    }

    public function test_supprimer_le_bien_supprime_ses_contacts(): void
    {
        $this->bien->contacts()->create(['phone' => '+221771112234', 'position' => 0]);

        $this->bien->forceDelete();

        $this->assertSame(0, DB::table('property_contacts')->count());
    }
}
