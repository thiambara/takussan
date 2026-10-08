<?php

namespace Tests\Feature\Admin\Platform;

use App\Jobs\Property\RevalidatePublicPropertyPage;
use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Testing\TestResponse;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0048 §2) — une agence suspendue disparaît de TOUTES les voies publiques, celles de
 * TCK-598 comprises : `/status`, les similaires (dont la liste d'identifiants est en cache), les
 * quartiers, les villes, le plan du site, la comparaison, la carte de contact, les avis, la vue.
 *
 * Chaque voie est d'abord éprouvée AVANT la suspension : un bien absent d'une voie dès le départ
 * rendrait son assertion vide. Le témoin, un bien sans agence de la même ville, reste partout.
 *
 * La fiche publique du front est en cache étiqueté par slug (ADR-0052) : la suspension et la levée
 * en demandent l'expiration pour chaque bien de l'agence, sans attendre les 300 s du front.
 */
class AgencySuspensionPublicPathsTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use OperateursPlateforme;
    use RefreshDatabase;

    private Agency $agence;

    private Property $bien;

    private Property $temoin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = $this->agence();
        $this->bien = $this->situe($this->bienDe($this->agence));
        $this->temoin = $this->situe($this->bienDe(null));
    }

    public function test_le_bien_d_une_agence_suspendue_quitte_toutes_les_voies_publiques(): void
    {
        // Les similaires du témoin sont calculés, donc mis en cache, AVANT la suspension.
        $this->assertVoies(true);

        $this->transition('suspend');
        $this->assertVoies(false);

        $this->transition('reinstate');
        $this->assertVoies(true);
    }

    public function test_suspendre_et_lever_expirent_la_fiche_en_cache_du_front(): void
    {
        $prive = $this->bienDe($this->agence, public: false);
        Bus::fake([RevalidatePublicPropertyPage::class]);

        foreach (['suspend', 'reinstate'] as $geste) {
            $this->transition($geste);

            Bus::assertDispatched(
                RevalidatePublicPropertyPage::class,
                fn (RevalidatePublicPropertyPage $job) => in_array($this->bien->slug, $job->slugs, true)
                    && in_array($prive->slug, $job->slugs, true),
            );
            Bus::assertNotDispatched(
                RevalidatePublicPropertyPage::class,
                fn (RevalidatePublicPropertyPage $job) => in_array($this->temoin->slug, $job->slugs, true),
            );
            Bus::fake([RevalidatePublicPropertyPage::class]);
        }
    }

    private function assertVoies(bool $visible): void
    {
        $this->app['auth']->forgetGuards();
        $slug = $this->bien->slug;
        $ids = "{$this->bien->id},{$this->temoin->id}";

        foreach ([
            "/api/public/properties/{$slug}",
            "/api/public/properties/{$slug}/status",
            "/api/public/properties/{$slug}/similar",
            "/api/public/properties/{$slug}/contact",
            "/api/public/properties/{$slug}/reviews",
        ] as $chemin) {
            $reponse = $this->getJson($chemin);
            $visible ? $this->assertNotSame(404, $reponse->status(), $chemin) : $reponse->assertNotFound();
        }
        // La vue rend 204 dans tous les cas (TCK-598) : c'est l'écriture qui doit manquer.
        $vues = (int) $this->bien->fresh()->views_count;
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.'.random_int(1, 254)])
            ->postJson("/api/public/properties/{$slug}/view")->assertNoContent();
        $this->assertSame($vues + ($visible ? 1 : 0), (int) $this->bien->fresh()->views_count, 'vue');

        foreach ([
            '/api/public/properties?per_page=50',
            '/api/public/properties/sitemap',
            "/api/public/properties/by-ids?ids={$ids}",
            "/api/public/properties/compare?ids={$ids}",
            "/api/public/properties/{$this->temoin->slug}/similar",
            "/api/public/properties/{$this->temoin->slug}/status",
            '/api/public/properties/discovery?near_city=Dakar',
        ] as $chemin) {
            $reponse = $this->getJson($chemin)->assertOk();
            $this->assertStringContainsString($this->temoin->slug, $this->sansSlugDeLaRequete($reponse, $chemin), $chemin);
            $visible
                ? $this->assertStringContainsString($slug, $reponse->getContent(), $chemin)
                : $this->assertStringNotContainsString($slug, $reponse->getContent(), $chemin);
        }

        $attendu = $visible ? 2 : 1;
        $this->assertSame([['value' => 'Dakar', 'count' => $attendu]], $this->getJson('/api/public/properties/cities')->json('data'));
        $this->assertSame([['value' => 'Mermoz', 'count' => $attendu]], $this->getJson('/api/public/properties/neighborhoods?city=Dakar')->json('data'));
    }

    /** Le témoin ne figure pas dans ses propres similaires : on cherche alors le bien suspendu seul. */
    private function sansSlugDeLaRequete(TestResponse $reponse, string $chemin): string
    {
        return str_contains($chemin, $this->temoin->slug) ? $this->temoin->slug : $reponse->getContent();
    }

    private function transition(string $geste): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->postJson("/api/admin/agencies/{$this->agence->id}/{$geste}", ['reason' => 'Enquête sur des plaintes de locataires.'])
            ->assertOk();
    }

    private function situe(Property $property): Property
    {
        Address::factory()->create([
            'addressable_id' => $property->id,
            'addressable_type' => Property::class,
            'city' => 'Dakar',
            'neighborhood' => 'Mermoz',
        ]);

        return $property->fresh();
    }
}
