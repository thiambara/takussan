<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use App\Models\User;
use App\Services\Property\SimilarPropertiesService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Mockery\MockInterface;
use Tests\ApiTestCase;

/**
 * TCK-598 (V17, contrainte 3) — **le compteur de vues n'est pas une modification du bien.**
 *
 * Trois observables, et chacun rougit sur un correctif différent — c'est pourquoi aucun ne suffit
 * seul :
 *
 *   · `views_count` — ce qu'on veut compter ;
 *   · `updated_at` — `$property->increment()` ET `Property::query()->…->increment()` le
 *     rajeunissent tous les deux (le constructeur Éloquent l'ajoute) ; seul `toBase()` ne le
 *     touche pas. Le sitemap le publie en `lastModified` ;
 *   · l'espion sur `SimilarPropertiesService::invalidateForProperty` — `PropertyObserver::updated`
 *     l'appelle, et il vide l'étiquette entière : un `withoutEvents()` le tait mais laisse la date.
 */
class PublicPropertyViewCounterTest extends ApiTestCase
{
    use RefreshDatabase;

    private const DATE_FIGEE = '2026-01-01 00:00:00';

    private function bienFige(int $vues = 5): Property
    {
        $property = Property::factory()->published()->create(['views_count' => $vues]);
        // `updated_at` posé APRÈS la création, par le constructeur de base : sans événement, et
        // sans que l'horodatage automatique ne l'écrase.
        Property::query()->whereKey($property->id)->toBase()->update(['updated_at' => self::DATE_FIGEE]);

        return $property->refresh();
    }

    private function espionDuCacheSimilaire(): MockInterface
    {
        return $this->spy(SimilarPropertiesService::class);
    }

    private function assertDateIntacte(Property $property): void
    {
        $this->assertSame(
            self::DATE_FIGEE,
            Carbon::parse(Property::query()->whereKey($property->id)->toBase()->value('updated_at'))->format('Y-m-d H:i:s'),
            '`updated_at` a été rajeuni par un comptage de vue.',
        );
    }

    /** AC4 — deux lectures de la fiche n'écrivent RIEN, et le sitemap garde la date. */
    public function test_lire_la_fiche_n_ecrit_rien(): void
    {
        $property = $this->bienFige(5);
        $espion = $this->espionDuCacheSimilaire();

        $this->getJson("/api/public/properties/{$property->slug}")->assertOk();
        $this->getJson("/api/public/properties/{$property->slug}")->assertOk();

        $this->assertSame(5, (int) Property::query()->whereKey($property->id)->value('views_count'));
        $this->assertDateIntacte($property);
        $espion->shouldNotHaveReceived('invalidateForProperty');

        $ligne = collect($this->getJson('/api/public/properties/sitemap')->assertOk()->json('data'))
            ->firstWhere('slug', $property->slug);
        $this->assertNotNull($ligne);
        $this->assertStringStartsWith('2026-01-01T00:00:00', $ligne['updated_at']);
    }

    /**
     * AC5 — deux vues depuis A, une depuis B : +2 (la déduplication est par (bien, IP) à 3 par heure,
     * donc A compte deux fois ici ; c'est la QUATRIÈME qui ne compte plus). Ni date ni espion.
     */
    public function test_compter_une_vue_n_est_pas_une_modification(): void
    {
        $property = $this->bienFige(5);
        $espion = $this->espionDuCacheSimilaire();

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.1'])
            ->postJson("/api/public/properties/{$property->slug}/view")->assertNoContent();
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.1'])
            ->postJson("/api/public/properties/{$property->slug}/view")->assertNoContent();
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.2'])
            ->postJson("/api/public/properties/{$property->slug}/view")->assertNoContent();

        $this->assertSame(8, (int) Property::query()->whereKey($property->id)->value('views_count'));
        $this->assertDateIntacte($property);
        $espion->shouldNotHaveReceived('invalidateForProperty');
    }

    /** La déduplication : au-delà de trois vues par heure depuis la même IP, rien ne compte. */
    public function test_une_meme_ip_ne_compte_que_trois_fois_par_heure(): void
    {
        $property = $this->bienFige(0);

        foreach (range(1, 5) as $_) {
            $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.3'])
                ->postJson("/api/public/properties/{$property->slug}/view")->assertNoContent();
        }

        $this->assertSame(3, (int) Property::query()->whereKey($property->id)->value('views_count'));
    }

    /** AC5 — un slug inconnu, ou un bien non public, rend 204 sans écriture. */
    public function test_un_slug_inconnu_ou_non_public_rend_204_sans_ecrire(): void
    {
        $brouillon = Property::factory()->draft()->create(['views_count' => 0]);

        $this->postJson('/api/public/properties/slug-qui-n-existe-pas/view')->assertNoContent();
        $this->postJson("/api/public/properties/{$brouillon->slug}/view")->assertNoContent();

        $this->assertSame(0, (int) Property::query()->whereKey($brouillon->id)->value('views_count'));
    }

    /**
     * AC16 — la route authentifiée garde sa réponse (`data.views_count` = initial + 1), n'écrit
     * pas la date, n'appelle pas l'espion ; et la route publique, depuis la MÊME IP dans l'heure,
     * partage la même déduplication.
     */
    public function test_les_deux_routes_partagent_un_seul_comptage(): void
    {
        $user = User::factory()->create();
        $property = $this->bienFige(5);
        $property->forceFill(['user_id' => $user->id])->saveQuietly();
        Property::query()->whereKey($property->id)->toBase()->update(['updated_at' => self::DATE_FIGEE]);
        $espion = $this->espionDuCacheSimilaire();

        Sanctum::actingAs($user);
        foreach ([6, 7, 8] as $attendu) {
            $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.4'])
                ->postJson("/api/properties/{$property->id}/view")
                ->assertOk()
                ->assertJsonPath('data.views_count', $attendu);
        }

        // Trois vues authentifiées ont épuisé le crédit horaire de cette IP : la route publique,
        // depuis la même IP, n'ajoute rien.
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.4'])
            ->postJson("/api/public/properties/{$property->slug}/view")->assertNoContent();

        $this->assertSame(8, (int) Property::query()->whereKey($property->id)->value('views_count'));
        $this->assertDateIntacte($property);
        $espion->shouldNotHaveReceived('invalidateForProperty');
    }
}
