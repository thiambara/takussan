<?php

namespace Tests\Feature\Tags;

use App\Models\Address;
use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0062 §7, D9 ; reverif-2 du lot D, fuite 2) — un bien n'est TROUVABLE que par les
 * équipements que sa fiche publique montre (`Tag::scopeVisiblesSurUneFiche`) : les approuvés, et
 * une proposition en attente là seulement où son AUTEUR l'a rattachée.
 *
 * B qui tape le nom de la proposition de A la rattache à son bien (D9), masquée sur sa fiche. Avant
 * ce correctif, le bien de B sortait pourtant dans la liste (`tags=`, `q=`), dans `filter[search]`
 * et sur la carte filtrée par ce nom : un visiteur filtrait sur un équipement et ouvrait une fiche
 * qui ne le montrait pas. Les quatre chemins sont éprouvés ici, puis l'approbation, qui rend le
 * bien de B trouvable — elle doit donc RÉINDEXER.
 */
class TagProposalRechercheTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const CADRAGE = '14.0,-18.0,15.5,-16.5';

    private const NOM = 'Puits privé de A';

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
        $this->bienDeA = $this->bienPublie($this->a);
        $this->bienDeB = $this->bienPublie($this->b);

        Sanctum::actingAs($this->a);
        $this->sync($this->bienDeA, ['tag_names' => [self::NOM]])->assertOk();
        $this->proposition = Tag::query()->where('name', self::NOM)->firstOrFail();
        $this->assertSame(ReferentialStatus::Pending, $this->proposition->status);

        Sanctum::actingAs($this->b);
        $this->sync($this->bienDeB, ['tag_names' => ['puits privé de a']])->assertOk();
        $this->assertSame([$this->proposition->id], $this->bienDeB->refresh()->tags->pluck('id')->all(), 'rattachée au bien de B (D9)');

        $this->indexProperties();
    }

    private function bienPublie(User $proprietaire): Property
    {
        $bien = Property::factory()->published()->create([
            'user_id' => $proprietaire->id,
            'title' => 'Maison familiale',
            'description' => 'Belle maison lumineuse.',
            'featured' => false,
            'published_at' => now()->subHour(),
        ]);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'country' => 'SN',
            'city' => 'Dakar',
            'neighborhood' => 'Almadies',
            'latitude' => 14.7,
            'longitude' => -17.45,
        ]);

        return $bien;
    }

    private function sync(Property $bien, array $corps): TestResponse
    {
        return $this->postJson("/api/properties/{$bien->id}/tags", $corps + ['tag_ids' => []]);
    }

    /** @return list<int> */
    private function tries(array $ids): array
    {
        $ids = array_values(array_map('intval', $ids));
        sort($ids);

        return $ids;
    }

    /** @return list<int> la liste publique, places réservées comprises */
    private function idsDeLaListe(array $criteres): array
    {
        $reponse = $this->getJson('/api/public/properties/search?'.http_build_query([...$criteres, 'per_page' => 100]))->assertOk();

        return $this->tries(array_unique([
            ...array_column($reponse->json('data') ?? [], 'id'),
            ...array_column($reponse->json('sponsored') ?? [], 'id'),
        ]));
    }

    /** @return list<int> */
    private function idsDeLaCarte(array $criteres): array
    {
        $reponse = $this->getJson('/api/public/properties/map?'.http_build_query(['bounds' => self::CADRAGE, ...$criteres]))->assertOk();

        return $this->tries(array_map(static fn (array $f) => (int) $f['properties']['id'], $reponse->json('features')));
    }

    /** @return list<int> le chemin de `filter[search]` (Scout) */
    private function idsDeScout(string $terme): array
    {
        return $this->tries(Property::search($terme)->keys()->all());
    }

    public function test_le_filtre_equipements_de_la_liste_ne_rend_que_le_bien_de_l_auteur(): void
    {
        $this->assertSame([$this->bienDeA->id], $this->idsDeLaListe(['tags' => self::NOM]));
        $this->assertSame($this->tries([$this->bienDeA->id, $this->bienDeB->id]), $this->idsDeLaListe([]), 'témoin : les deux sont publiés');
    }

    public function test_la_recherche_par_mot_ne_trouve_pas_le_bien_de_b_par_ce_nom(): void
    {
        $this->assertSame([$this->bienDeA->id], $this->idsDeLaListe(['q' => 'puits privé']));
        $this->assertSame([$this->bienDeA->id], $this->idsDeScout('puits privé'));
    }

    public function test_le_filtre_equipements_de_la_carte_ne_rend_que_le_bien_de_l_auteur(): void
    {
        $this->assertSame([$this->bienDeA->id], $this->idsDeLaCarte(['tags' => self::NOM]));
        $this->assertSame($this->tries([$this->bienDeA->id, $this->bienDeB->id]), $this->idsDeLaCarte([]), 'témoin : les deux sont sur la carte');
    }

    public function test_un_equipement_approuve_reste_trouvable_partout(): void
    {
        $piscine = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        $this->bienDeB->tags()->attach($piscine->id);
        $this->indexProperties();

        $this->assertSame([$this->bienDeB->id], $this->idsDeLaListe(['tags' => 'Piscine']));
        $this->assertSame([$this->bienDeB->id], $this->idsDeLaCarte(['tags' => 'Piscine']));
    }

    /** L'approbation rend la proposition visible sur la fiche de B : elle doit l'y rendre trouvable. */
    public function test_l_approbation_rend_le_bien_de_b_trouvable(): void
    {
        $this->actingAsRole('super_admin');
        $this->postJson("/api/admin/tags/{$this->proposition->id}/approve")->assertOk();
        $this->waitForMeilisearch();

        $deux = $this->tries([$this->bienDeA->id, $this->bienDeB->id]);
        $this->assertSame($deux, $this->idsDeLaListe(['tags' => self::NOM]));
        $this->assertSame($deux, $this->idsDeScout('puits privé'));
        $this->assertSame($deux, $this->idsDeLaCarte(['tags' => self::NOM]));
    }
}
