<?php

namespace Tests\Feature\Tags;

use App\Models\Customer;
use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0062 §7) — la file des équipements proposés. Un refus DÉTACHE (la fiche ne doit
 * plus afficher un libellé que la modération a écarté) ; une fusion déplace les liaisons vers la
 * cible et supprime la source.
 */
class TagModerationTest extends TestCase
{
    use RefreshDatabase;

    private User $auteur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->auteur = User::factory()->create();
    }

    private function proposition(string $nom): Tag
    {
        return Tag::factory()->create(['name' => $nom, 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => $this->auteur->id]);
    }

    public function test_un_agent_n_entre_pas_dans_la_file(): void
    {
        $this->actingAsRole('agent');
        $t = $this->proposition('Puits');

        $this->getJson('/api/admin/tags/proposals')->assertForbidden();
        $this->postJson("/api/admin/tags/{$t->id}/approve")->assertForbidden();
    }

    public function test_la_file_liste_les_propositions(): void
    {
        $this->actingAsRole('super_admin');
        $t = $this->proposition('Puits');
        Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        Property::factory()->create()->tags()->attach($t);

        $this->getJson('/api/admin/tags/proposals?filter[status]=pending')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Puits')
            ->assertJsonPath('data.0.created_by.id', $this->auteur->id)
            ->assertJsonPath('data.0.properties_count', 1);
    }

    public function test_approuver_puis_reapprouver(): void
    {
        $this->actingAsRole('super_admin');
        $t = $this->proposition('Puits');

        $this->postJson("/api/admin/tags/{$t->id}/approve")->assertOk()->assertJsonPath('data.status', 'approved');
        $this->postJson("/api/admin/tags/{$t->id}/approve")->assertStatus(409)->assertJsonPath('code', 'tags.not_pending');
    }

    public function test_refuser_detache_des_biens(): void
    {
        $this->actingAsRole('super_admin');
        $t = $this->proposition('Puits');
        $bien = Property::factory()->create();
        $bien->tags()->attach($t);

        $this->postJson("/api/admin/tags/{$t->id}/reject")->assertOk()->assertJsonPath('data.status', 'rejected');

        $this->assertCount(0, $bien->refresh()->tags);
        $this->assertTrue(Tag::query()->whereKey($t->id)->exists());
    }

    public function test_renommer_et_le_nom_pris(): void
    {
        $this->actingAsRole('super_admin');
        Tag::factory()->create(['name' => 'VIP', 'type' => TagType::Crm]);
        $t = $this->proposition('puit');

        $this->patchJson("/api/admin/tags/{$t->id}", ['name' => 'Puits'])->assertOk()->assertJsonPath('data.name', 'Puits');
        $this->patchJson("/api/admin/tags/{$t->id}", ['name' => 'vip'])->assertStatus(409)->assertJsonPath('code', 'tags.name_taken');
    }

    public function test_fusionner_deplace_les_liaisons_sans_doublon(): void
    {
        $this->actingAsRole('super_admin');
        $cible = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        $source = $this->proposition('Piscine privée');
        $a = Property::factory()->create();
        $b = Property::factory()->create();
        $a->tags()->attach($source);
        $b->tags()->attach([$source->id, $cible->id]);

        $this->postJson("/api/admin/tags/{$source->id}/merge", ['into_id' => $cible->id])->assertOk()->assertJsonPath('data.id', $cible->id);

        $this->assertFalse(Tag::query()->whereKey($source->id)->exists());
        $this->assertSame([$cible->id], $a->refresh()->tags->pluck('id')->all());
        $this->assertSame([$cible->id], $b->refresh()->tags->pluck('id')->all());
    }

    public function test_les_fusions_impossibles(): void
    {
        $this->actingAsRole('super_admin');
        $t = $this->proposition('Puits');
        $crm = Tag::factory()->create(['name' => 'VIP', 'type' => TagType::Crm]);
        $refuse = Tag::factory()->create(['name' => 'Garage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Rejected]);

        $this->postJson("/api/admin/tags/{$t->id}/merge", ['into_id' => $t->id])->assertUnprocessable()->assertJsonPath('code', 'tags.merge_into_self');
        $this->postJson("/api/admin/tags/{$t->id}/merge", ['into_id' => $crm->id])->assertUnprocessable()->assertJsonPath('code', 'tags.merge_target_invalid');
        $this->postJson("/api/admin/tags/{$t->id}/merge", ['into_id' => $refuse->id])->assertUnprocessable()->assertJsonPath('code', 'tags.merge_target_invalid');
        $this->assertTrue(Tag::query()->whereKey($t->id)->exists());
    }

    /**
     * Les fusions restent au sein d'un même type : l'écran ne propose que des équipements, mais
     * l'API accepte tout identifiant — une étiquette CRM fusionnée dans un équipement serait
     * SUPPRIMÉE, ses liaisons (des clients) recopiées sur l'équipement. Perte irréversible.
     */
    public function test_une_etiquette_crm_ne_se_fusionne_pas_dans_un_equipement(): void
    {
        $this->actingAsRole('super_admin');
        $crm = Tag::factory()->create(['name' => 'VIP', 'type' => TagType::Crm]);
        $wifi = Tag::factory()->create(['name' => 'WiFi', 'type' => TagType::Amenity]);

        $this->postJson("/api/admin/tags/{$crm->id}/merge", ['into_id' => $wifi->id])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'tags.merge_source_invalid');

        $this->assertTrue(Tag::query()->whereKey($crm->id)->exists());
    }

    /**
     * Le contournement en deux temps : basculer l'étiquette CRM en équipement (`PUT /api/tags`),
     * PUIS la fusionner. Le type seul ne suffit pas à juger la source — ce sont ses LIAISONS : une
     * source qui porte des clients ne se fusionne pas dans un équipement.
     */
    public function test_une_etiquette_crm_basculee_en_equipement_ne_se_fusionne_pas(): void
    {
        $this->actingAsRole('super_admin');
        $vip = Tag::factory()->create(['name' => 'VIP', 'type' => TagType::Crm]);
        $client = Customer::factory()->create();
        $client->tags()->attach($vip->id);
        $wifi = Tag::factory()->create(['name' => 'WiFi', 'type' => TagType::Amenity]);

        $this->putJson("/api/tags/{$vip->id}", ['type' => 'amenity'])->assertOk();
        $this->postJson("/api/admin/tags/{$vip->id}/merge", ['into_id' => $wifi->id])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'tags.merge_source_invalid');

        $this->assertTrue(Tag::query()->whereKey($vip->id)->exists());
        $this->assertSame([$vip->id], $client->refresh()->tags->pluck('id')->all());
        $this->assertSame([], $wifi->customers()->pluck('customers.id')->all());
    }
}
