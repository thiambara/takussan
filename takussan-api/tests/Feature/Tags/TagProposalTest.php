<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0062 §7) — « Ajouter "Puits" » dans le champ des équipements : la proposition se
 * crée, s'attache au bien, et attend la modération. Le patron d'appel est celui de
 * `PropertyTagsTest` (le propriétaire du bien).
 */
class TagProposalTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create();
        $this->bien = Property::factory()->create(['user_id' => $this->owner->id]);
        Sanctum::actingAs($this->owner);
    }

    private function sync(array $corps): TestResponse
    {
        return $this->postJson("/api/properties/{$this->bien->id}/tags", $corps + ['tag_ids' => []]);
    }

    public function test_un_nom_nouveau_devient_une_proposition_attachee(): void
    {
        $piscine = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);

        $this->sync(['tag_ids' => [$piscine->id], 'tag_names' => ['  Puits  ']])->assertOk()->assertJsonCount(2, 'data');

        $puits = Tag::query()->where('name', 'Puits')->firstOrFail();
        $this->assertSame(ReferentialStatus::Pending, $puits->status);
        $this->assertSame(TagType::Amenity, $puits->type);
        $this->assertSame($this->owner->id, $puits->created_by_id);
        $this->assertEqualsCanonicalizing([$piscine->id, $puits->id], $this->bien->refresh()->tags->pluck('id')->all());
    }

    public function test_un_nom_connu_a_la_casse_pres_reprend_l_existant(): void
    {
        $piscine = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);

        $this->sync(['tag_names' => ['PISCINE']])->assertOk();

        $this->assertSame(1, Tag::query()->count());
        $this->assertSame([$piscine->id], $this->bien->refresh()->tags->pluck('id')->all());
    }

    public function test_deux_auteurs_qui_proposent_le_meme_nom_partagent_la_proposition(): void
    {
        $this->sync(['tag_names' => ['Puits']])->assertOk();
        $autre = User::factory()->create();
        $sienne = Property::factory()->create(['user_id' => $autre->id]);
        Sanctum::actingAs($autre);

        $this->postJson("/api/properties/{$sienne->id}/tags", ['tag_ids' => [], 'tag_names' => ['puits']])->assertOk();

        $this->assertSame(1, Tag::query()->whereRaw('LOWER(name) = ?', ['puits'])->count());
    }

    public function test_un_nom_refuse_n_est_ni_recree_ni_attache(): void
    {
        Tag::factory()->create(['name' => 'Garage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Rejected]);

        $this->sync(['tag_names' => ['Garage']])->assertOk()->assertJsonCount(0, 'data');

        $this->assertSame(1, Tag::query()->where('name', 'Garage')->count());
    }

    public function test_un_nom_pris_par_une_etiquette_crm_est_refuse(): void
    {
        Tag::factory()->create(['name' => 'VIP', 'type' => TagType::Crm]);

        $this->sync(['tag_names' => ['vip']])->assertUnprocessable()->assertJsonPath('code', 'tags.name_taken');
    }

    public function test_un_equipement_refuse_ne_s_attache_pas_par_son_identifiant(): void
    {
        $garage = Tag::factory()->create(['name' => 'Garage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Rejected]);

        $this->sync(['tag_ids' => [$garage->id]])->assertUnprocessable()->assertJsonValidationErrors('tag_ids.0');
    }

    /**
     * Même règle que les quartiers (`GeoAddressRules`) : la proposition d'un AUTRE ne se désigne
     * pas par son identifiant — les identifiants sont séquentiels, donc énumérables, et la
     * proposition sortirait sur une fiche publique avant toute modération (D9).
     */
    public function test_la_proposition_d_un_autre_ne_s_attache_pas_par_son_identifiant(): void
    {
        $autre = User::factory()->create();
        $sienne = Tag::factory()->create(['name' => 'Puits privé', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => $autre->id]);
        $nonAttachee = Tag::factory()->create(['name' => 'Forage privé', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => $autre->id]);
        // Le cas RÉEL : une proposition naît rattachée au bien de son auteur. « Déjà portée par CE
        // bien » ne doit pas devenir « déjà portée par UN bien » — ce qu'est toute proposition.
        Property::factory()->create(['user_id' => $autre->id])->tags()->attach($sienne->id, ['attached_by_id' => $autre->id]);

        $this->sync(['tag_ids' => [$sienne->id]])->assertUnprocessable()->assertJsonValidationErrors('tag_ids.0');
        $this->sync(['tag_ids' => [$nonAttachee->id]])->assertUnprocessable()->assertJsonValidationErrors('tag_ids.0');
        $this->assertSame([], $this->bien->refresh()->tags->pluck('id')->all());
    }

    public function test_sa_propre_proposition_s_attache_par_son_identifiant(): void
    {
        $mienne = Tag::factory()->create(['name' => 'Puits', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => $this->owner->id]);

        $this->sync(['tag_ids' => [$mienne->id]])->assertOk()->assertJsonCount(1, 'data');
    }

    /**
     * Une proposition partagée par son NOM (deux auteurs, un même « Puits ») est déjà sur le bien :
     * le formulaire la renvoie par identifiant à l'enregistrement suivant, et elle doit tenir.
     */
    public function test_une_proposition_deja_attachee_au_bien_se_garde(): void
    {
        $autre = User::factory()->create();
        $partagee = Tag::factory()->create(['name' => 'Puits', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => $autre->id]);
        $this->bien->tags()->attach($partagee->id);

        $this->sync(['tag_ids' => [$partagee->id]])->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_les_bornes_des_noms(): void
    {
        $this->sync(['tag_names' => array_map(fn ($i) => "Équipement {$i}", range(1, 21))])->assertUnprocessable()->assertJsonValidationErrors('tag_names');
        $this->sync(['tag_names' => [str_repeat('a', 101)]])->assertUnprocessable()->assertJsonValidationErrors('tag_names.0');
        $this->sync(['tag_names' => ['', '   ']])->assertOk()->assertJsonCount(0, 'data');
    }
}
