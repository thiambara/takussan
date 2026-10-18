<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Models\User;
use App\Services\Tags\TagCatalog;
use App\Services\Tags\TagProposals;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-847 (P30.03) — les slugs du catalogue sont réservés. Le front traduit un équipement du
 * catalogue par son slug (`amenityCatalog.<slug>`) : une proposition « Forage ! » prenait le slug
 * `forage`, et l'équipement « Forage » ajouté ensuite par `synchroniser()` recevait `forage-2`,
 * sans traduction.
 *
 *   · une proposition dont le slug serait celui d'un nom du catalogue, sans porter ce nom, reçoit
 *     d'office un suffixe ;
 *   · `synchroniser()` reprend le slug exact à une proposition non approuvée qui le détient.
 */
class TagCatalogSlugReserveTest extends TestCase
{
    use RefreshDatabase;

    private User $auteur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->auteur = User::factory()->create();
    }

    private function proposer(string $nom): Tag
    {
        [$id] = app(TagProposals::class)->resoudre([$nom], $this->auteur);

        return Tag::query()->findOrFail($id);
    }

    public function test_une_proposition_ne_prend_pas_le_slug_d_un_nom_du_catalogue(): void
    {
        $proposition = $this->proposer('Forage !');
        $this->assertNotSame('forage', $proposition->slug);

        app(TagCatalog::class)->synchroniser();

        $this->assertSame('forage', Tag::query()->where('name', 'Forage')->value('slug'));
        $this->assertSame(ReferentialStatus::Pending, $proposition->refresh()->status);
    }

    /** Une proposition qui porte le nom même du catalogue EST l'équipement : elle garde son slug. */
    public function test_une_proposition_du_nom_du_catalogue_garde_le_slug_et_est_approuvee(): void
    {
        $proposition = $this->proposer('Forage');
        $this->assertSame('forage', $proposition->slug);

        app(TagCatalog::class)->synchroniser();

        $this->assertSame(['forage'], Tag::query()->whereRaw("slug like 'forage%'")->pluck('slug')->all());
        $this->assertSame(ReferentialStatus::Approved, $proposition->refresh()->status);
    }

    /** Une ligne déjà en base avant le correctif : `synchroniser()` lui reprend le slug. */
    public function test_synchroniser_reprend_le_slug_a_une_proposition_non_approuvee(): void
    {
        foreach ([ReferentialStatus::Pending, ReferentialStatus::Rejected] as $i => $statut) {
            [$nom, $slug] = [['Forage !', 'forage'], ['Fibre optique.', 'fibre-optique']][$i];
            Tag::factory()->create(['name' => $nom, 'slug' => $slug, 'type' => TagType::Amenity, 'status' => $statut, 'created_by_id' => $this->auteur->id]);
        }

        app(TagCatalog::class)->synchroniser();

        $this->assertSame('forage', Tag::query()->where('name', 'Forage')->value('slug'));
        $this->assertSame('fibre-optique', Tag::query()->where('name', 'Fibre optique')->value('slug'));
        $this->assertNotSame('forage', Tag::query()->where('name', 'Forage !')->value('slug'));
        $this->assertNotSame('fibre-optique', Tag::query()->where('name', 'Fibre optique.')->value('slug'));
        $this->assertSame(ReferentialStatus::Pending, Tag::query()->where('name', 'Forage !')->first()->status);
    }

    /** Une proposition déjà approuvée garde ce qu'elle a : seul un slug non approuvé se reprend. */
    public function test_une_proposition_approuvee_garde_son_slug(): void
    {
        Tag::factory()->create(['name' => 'Forage !', 'slug' => 'forage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Approved, 'created_by_id' => $this->auteur->id]);

        app(TagCatalog::class)->synchroniser();

        $this->assertSame('forage', Tag::query()->where('name', 'Forage !')->value('slug'));
        $this->assertSame('forage-2', Tag::query()->where('name', 'Forage')->value('slug'));
    }
}
