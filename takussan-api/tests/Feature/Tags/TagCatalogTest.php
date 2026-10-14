<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Models\User;
use App\Services\Tags\TagCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (ADR-0062 §7) — le catalogue des équipements, chargé à chaque déploiement
 * (`tags:sync-catalog`) : idempotent, il ne ressuscite pas un refus et ne double pas un nom à la
 * casse près.
 */
class TagCatalogTest extends TestCase
{
    use RefreshDatabase;

    private function synchroniser(): void
    {
        app(TagCatalog::class)->synchroniser();
    }

    public function test_le_catalogue_cree_les_equipements_et_les_etiquettes_crm(): void
    {
        $this->synchroniser();

        $this->assertSame(count(TagCatalog::EQUIPEMENTS), Tag::query()->where('type', TagType::Amenity->value)->where('status', ReferentialStatus::Approved->value)->count());
        $this->assertSame(35, count(TagCatalog::EQUIPEMENTS));
        $this->assertSame(count(TagCatalog::CRM), Tag::query()->where('type', TagType::Crm->value)->count());
        $this->assertTrue(Tag::query()->where('name', 'Groupe électrogène')->exists());
    }

    public function test_un_ancien_feature_devient_un_equipement_sous_le_meme_identifiant(): void
    {
        $piscine = Tag::factory()->create(['name' => 'Piscine', 'slug' => 'piscine', 'type' => TagType::Feature]);

        $this->synchroniser();

        $this->assertSame(TagType::Amenity, $piscine->refresh()->type);
        $this->assertSame(0, Tag::query()->where('type', TagType::Feature->value)->count());
        $this->assertSame(1, Tag::query()->where('name', 'Piscine')->count());
    }

    public function test_une_proposition_reprise_par_le_catalogue_est_approuvee(): void
    {
        $forage = Tag::factory()->create(['name' => 'forage', 'slug' => 'forage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => User::factory()->create()->id]);

        $this->synchroniser();

        $this->assertSame(ReferentialStatus::Approved, $forage->refresh()->status);
        $this->assertSame(1, Tag::query()->whereRaw('LOWER(name) = ?', ['forage'])->count());
    }

    public function test_un_refus_reste_un_refus(): void
    {
        $garage = Tag::factory()->create(['name' => 'Garage', 'slug' => 'garage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Rejected]);

        $this->synchroniser();

        $this->assertSame(ReferentialStatus::Rejected, $garage->refresh()->status);
    }

    public function test_deux_passages_ne_changent_rien(): void
    {
        $this->synchroniser();
        $avant = Tag::query()->orderBy('id')->get(['id', 'name', 'type', 'status'])->toArray();

        $this->artisan('tags:sync-catalog')->assertSuccessful();

        $this->assertSame($avant, Tag::query()->orderBy('id')->get(['id', 'name', 'type', 'status'])->toArray());
    }
}
