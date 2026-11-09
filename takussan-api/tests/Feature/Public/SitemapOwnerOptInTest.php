<?php

namespace Tests\Feature\Public;

use App\Http\Requests\Public\IndexPublicProfilesRequest;
use App\Models\Address;
use App\Models\Enums\UserStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2506 (AC3) — un propriétaire qui active la préférence apparaît dans l'annuaire ET au sitemap.
 *
 * `/sitemap.xml` n'a pas de source propre pour les personnes : le front pagine l'INDEX public
 * (`takussan-web/src/lib/queries/public-profiles.ts`, `listerSlugsDeProfils`, à la taille de page
 * maximale) et y prend chaque `slug`. Ce test joue donc le parcours entier côté API : la
 * préférence posée par le compte lui-même, puis la page que le sitemap lit.
 */
class SitemapOwnerOptInTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_proprietaire_entre_dans_la_source_du_sitemap_quand_il_le_choisit_et_en_sort_quand_il_y_renonce(): void
    {
        $proprietaire = User::factory()->create(['username' => 'awa-diop', 'status' => UserStatus::Active]);
        $bien = Property::factory()->published()->create(['user_id' => $proprietaire->id]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => 'Dakar',
        ]);

        $sourceDuSitemap = '/api/public/agents?per_page='.IndexPublicProfilesRequest::PER_PAGE_MAX;
        $ids = fn () => array_column($this->getJson($sourceDuSitemap)->assertOk()->json('data'), 'id');

        $this->assertNotContains($proprietaire->id, $ids());

        $this->actingAs($proprietaire)->patchJson('/api/me', ['listed_in_public_directory' => true])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->assertContains($proprietaire->id, $ids());

        $this->actingAs($proprietaire)->patchJson('/api/me', ['listed_in_public_directory' => false])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->assertNotContains($proprietaire->id, $ids());
    }

    /**
     * Le compte créé comme le crée `AuthController::register` : ni `username`, ni rien d'autre que le
     * nom, l'e-mail et le mot de passe. Sa seule adresse est le `public_slug` que pose
     * `users:public-slugs` ; l'index exigeait un `username` non nul, et ce propriétaire, qui avait
     * pourtant choisi l'annuaire et dont la fiche était servie, n'entrait ni dans l'annuaire ni au
     * sitemap.
     */
    public function test_un_proprietaire_inscrit_par_le_formulaire_entre_au_sitemap_par_son_slug_au_nom(): void
    {
        $proprietaire = User::create([
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'email' => 'awa.diop@example.test',
            'password' => 'Mot-de-passe-1!',
        ]);
        $this->assertNull($proprietaire->fresh()->username);
        $bien = Property::factory()->published()->create(['user_id' => $proprietaire->id]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => 'Dakar',
        ]);

        $this->actingAs($proprietaire)->patchJson('/api/me', ['listed_in_public_directory' => true])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->artisan('users:public-slugs')->assertSuccessful();

        $lignes = $this->getJson('/api/public/agents?per_page='.IndexPublicProfilesRequest::PER_PAGE_MAX)
            ->assertOk()->json('data');
        $this->assertSame([[$proprietaire->id, 'awa-d']], array_map(fn (array $l) => [$l['id'], $l['slug']], $lignes));
        $this->getJson('/api/public/agents/awa-d')->assertOk()->assertJsonPath('data.indexable', true);
    }
}
