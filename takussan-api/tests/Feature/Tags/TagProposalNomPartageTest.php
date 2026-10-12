<?php

namespace Tests\Feature\Tags;

use App\Models\Customer;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use App\Services\Property\PropertyDuplicationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0062 §7, D9) — « un équipement ajouté est rattaché tout de suite, proposé aux
 * autres seulement après validation ».
 *
 * Le nom d'une étiquette est unique, tous types confondus (`tags_name_lower_unique`) : B qui tape
 * le nom d'une proposition EN ATTENTE de A retombe forcément sur la même ligne. La règle retenue :
 * la ligne est rattachée au bien de B (D9 : son formulaire la montre, « en attente »), mais elle ne
 * sort sur la fiche PUBLIQUE de B qu'une fois approuvée — seule l'attache faite par l'AUTEUR de la
 * proposition (`taggables.attached_by_id = tags.created_by_id`) est publique avant modération.
 *
 * Les deux chemins sont éprouvés : par identifiant (refusé, 422) et par nom (rattaché, masqué), sur
 * un bien sans équipement (création) et sur un bien qui en porte déjà (modification). Et un nom
 * d'équipement n'atterrit jamais sur un client.
 */
class TagProposalNomPartageTest extends TestCase
{
    use RefreshDatabase;

    private User $a;

    private User $b;

    private Property $bienDeA;

    private Property $bienDeB;

    private Tag $proposition;

    protected function setUp(): void
    {
        parent::setUp();
        $this->a = User::factory()->create();
        $this->b = User::factory()->create();
        $this->bienDeA = Property::factory()->published()->create(['user_id' => $this->a->id]);
        $this->bienDeB = Property::factory()->published()->create(['user_id' => $this->b->id]);

        // Le cas réel : la proposition de A naît ATTACHÉE au bien de A, par A.
        Sanctum::actingAs($this->a);
        $this->sync($this->bienDeA, ['tag_names' => ['Puits privé de A']])->assertOk();
        $this->proposition = Tag::query()->where('name', 'Puits privé de A')->firstOrFail();
        $this->assertSame(ReferentialStatus::Pending, $this->proposition->status);
        $this->assertSame($this->a->id, $this->proposition->created_by_id);
    }

    private function sync(Property $bien, array $corps): TestResponse
    {
        return $this->postJson("/api/properties/{$bien->id}/tags", $corps + ['tag_ids' => []]);
    }

    /** @return list<string> */
    private function nomsPublics(Property $bien): array
    {
        return collect($this->getJson("/api/public/properties/{$bien->slug}")->assertOk()->json('data.tags'))
            ->pluck('name')->sort()->values()->all();
    }

    public function test_la_proposition_de_l_auteur_sort_sur_sa_fiche_publique(): void
    {
        $this->assertSame(['Puits privé de A'], $this->nomsPublics($this->bienDeA));
    }

    public function test_par_nom_sur_un_bien_neuf_rattachee_mais_absente_de_la_fiche_publique_de_b(): void
    {
        Sanctum::actingAs($this->b);

        $this->sync($this->bienDeB, ['tag_names' => ['puits privé de a']])
            ->assertOk()
            ->assertJsonPath('data.0.id', $this->proposition->id)
            ->assertJsonPath('data.0.status', 'pending');

        $this->assertSame(1, Tag::query()->count(), 'aucune ligne de plus : le nom est unique');
        $this->assertSame([$this->proposition->id], $this->bienDeB->refresh()->tags->pluck('id')->all());
        $this->assertSame([], $this->nomsPublics($this->bienDeB));
        $this->assertSame(['Puits privé de A'], $this->nomsPublics($this->bienDeA));
    }

    public function test_par_nom_sur_un_bien_qui_porte_deja_des_equipements_puis_aller_retour_du_formulaire(): void
    {
        $piscine = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        Sanctum::actingAs($this->b);
        $this->sync($this->bienDeB, ['tag_ids' => [$piscine->id]])->assertOk();

        $this->sync($this->bienDeB, ['tag_ids' => [$piscine->id], 'tag_names' => ['PUITS PRIVÉ DE A']])->assertOk();
        // Le formulaire renvoie ensuite la proposition par son identifiant : elle se garde, masquée.
        $this->sync($this->bienDeB, ['tag_ids' => [$piscine->id, $this->proposition->id]])->assertOk()->assertJsonCount(2, 'data');

        $this->assertSame(['Piscine'], $this->nomsPublics($this->bienDeB));
    }

    /** Le comparateur public sert les mêmes étiquettes que la fiche. */
    public function test_le_comparateur_applique_la_meme_regle(): void
    {
        Sanctum::actingAs($this->b);
        $this->sync($this->bienDeB, ['tag_names' => ['puits privé de a']])->assertOk();

        $rendu = collect($this->getJson("/api/public/properties/compare?ids={$this->bienDeA->id},{$this->bienDeB->id}")->assertOk()->json('data'))
            ->mapWithKeys(fn (array $bien) => [$bien['id'] => collect($bien['tags'])->pluck('name')->all()]);

        $this->assertSame(['Puits privé de A'], $rendu[$this->bienDeA->id]);
        $this->assertSame([], $rendu[$this->bienDeB->id]);
    }

    public function test_une_fois_approuvee_elle_sort_sur_la_fiche_de_b(): void
    {
        Sanctum::actingAs($this->b);
        $this->sync($this->bienDeB, ['tag_names' => ['puits privé de a']])->assertOk();

        $this->proposition->forceFill(['status' => ReferentialStatus::Approved])->save();

        $this->assertSame(['Puits privé de A'], $this->nomsPublics($this->bienDeB));
    }

    public function test_par_identifiant_refusee_sur_un_bien_neuf_comme_sur_un_bien_equipe(): void
    {
        $piscine = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        Sanctum::actingAs($this->b);

        $this->sync($this->bienDeB, ['tag_ids' => [$this->proposition->id]])->assertUnprocessable()->assertJsonValidationErrors('tag_ids.0');
        $this->sync($this->bienDeB, ['tag_ids' => [$piscine->id]])->assertOk();
        $this->sync($this->bienDeB, ['tag_ids' => [$piscine->id, $this->proposition->id]])->assertUnprocessable()->assertJsonValidationErrors('tag_ids.1');

        $this->assertSame([$piscine->id], $this->bienDeB->refresh()->tags->pluck('id')->all());
    }

    public function test_la_fiche_de_la_proposition_d_un_autre_est_introuvable(): void
    {
        Sanctum::actingAs($this->b);
        $this->getJson("/api/tags/{$this->proposition->id}")->assertNotFound();

        Sanctum::actingAs($this->a);
        $this->getJson("/api/tags/{$this->proposition->id}")->assertOk()->assertJsonPath('data.name', 'Puits privé de A');
    }

    /** @return int|null l'auteur de la liaison (tag, bien) */
    private function attachePar(Tag $tag, Property $bien): ?int
    {
        $v = DB::table('taggables')->where('tag_id', $tag->id)->where('taggable_type', Property::class)->where('taggable_id', $bien->id)->value('attached_by_id');

        return $v === null ? null : (int) $v;
    }

    /** La copie naît brouillon et privée : on la publie comme le ferait son propriétaire. */
    private function publier(Property $copie): Property
    {
        $copie->forceFill([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'published_at' => now(),
        ])->save();

        return $copie->refresh();
    }

    /**
     * TCK-633 (reverif-2, fuite 1) — chaque liaison de la copie a pour auteur CELUI QUI DUPLIQUE,
     * jamais l'auteur recopié de la source. A qui duplique son propre bien garde sa proposition
     * visible sur la copie.
     */
    public function test_l_auteur_qui_duplique_son_bien_garde_sa_proposition_visible_sur_la_copie(): void
    {
        $copie = app(PropertyDuplicationService::class)->duplicate(source: $this->bienDeA, actor: $this->a, options: []);

        $this->assertSame($this->a->id, $this->attachePar($this->proposition, $copie));
        $this->assertSame(['Puits privé de A'], $this->nomsPublics($this->publier($copie)));
    }

    /**
     * Un tiers qui a le droit de modifier le bien de A (ici le super-admin, par la route) le
     * duplique : la copie lui appartient, la liaison porte SON identifiant, et la proposition de A
     * — encore en attente — ne sort pas sur la fiche publique de la copie. Elle reste rattachée
     * (le formulaire de la copie la montre « en attente »), comme quand B tape le nom.
     */
    public function test_un_tiers_qui_duplique_ne_publie_pas_la_proposition_de_l_auteur(): void
    {
        $tiers = $this->actingAsRole('super_admin');
        $id = $this->postJson("/api/properties/{$this->bienDeA->id}/duplicate", [])->assertCreated()->json('data.id');
        $copie = Property::query()->findOrFail($id);

        $this->assertSame($tiers->id, $copie->user_id);
        $this->assertSame($tiers->id, $this->attachePar($this->proposition, $copie));
        $this->assertSame([], $this->nomsPublics($this->publier($copie)));
        $this->assertSame(['Puits privé de A'], $this->nomsPublics($this->bienDeA), 'la source est intacte');
    }

    /** Une étiquette approuvée suit la copie d'un tiers et sort sur sa fiche, comme partout. */
    public function test_un_tiers_qui_duplique_garde_les_equipements_approuves_visibles(): void
    {
        $piscine = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        Sanctum::actingAs($this->a);
        $this->sync($this->bienDeA, ['tag_ids' => [$piscine->id, $this->proposition->id]])->assertOk();

        $tiers = User::factory()->create();
        $copie = app(PropertyDuplicationService::class)->duplicate(source: $this->bienDeA, actor: $tiers, options: []);

        $this->assertSame(['Piscine'], $this->nomsPublics($this->publier($copie)));
    }

    /**
     * Une fusion entre deux propositions du MÊME auteur recopie les liaisons avec leur auteur : la
     * cible, encore en attente, reste visible là où il l'avait rattachée.
     */
    public function test_une_fusion_recopie_l_auteur_des_liaisons(): void
    {
        $autreBienDeA = Property::factory()->published()->create(['user_id' => $this->a->id]);
        Sanctum::actingAs($this->a);
        $this->sync($autreBienDeA, ['tag_names' => ['Forage']])->assertOk();
        $forage = Tag::query()->where('name', 'Forage')->firstOrFail();

        $this->actingAsRole('super_admin');
        $this->postJson("/api/admin/tags/{$this->proposition->id}/merge", ['into_id' => $forage->id])->assertOk();

        $this->assertSame($this->a->id, $this->attachePar($forage, $this->bienDeA));
        $this->assertSame(['Forage'], $this->nomsPublics($this->bienDeA));
    }

    public function test_un_nom_d_equipement_n_atterrit_jamais_sur_un_client(): void
    {
        $client = Customer::factory()->create(['added_by_id' => $this->b->id]);
        Sanctum::actingAs($this->b);

        $this->postJson("/api/customers/{$client->id}/tags", ['tags' => ['vip', 'puits privé de a']])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'tags.name_taken');

        $this->assertSame([], $client->refresh()->tags->pluck('id')->all());
        $this->assertSame(0, Tag::query()->where('name', 'vip')->count(), 'rien créé : la requête est refusée en entier');
    }
}
