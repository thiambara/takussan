<?php

namespace Tests\Feature\Public;

use App\Jobs\Property\RevalidatePublicPropertyPage;
use App\Models\Address;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as RequeteSortante;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\ApiTestCase;

/**
 * TCK-598 (contrainte 6, AC6, ADR-0052 §2) — ce qui invalide le cache de la fiche publique, et ce
 * qui ne l'invalide pas.
 */
class PropertyPublicCacheObserverTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @return list<list<string>> les slugs de chaque job mis en file */
    private function slugsEnFile(): array
    {
        return Queue::pushed(RevalidatePublicPropertyPage::class)
            ->map(fn (RevalidatePublicPropertyPage $job) => $job->slugs)
            ->values()
            ->all();
    }

    public function test_modifier_le_prix_met_en_file_une_invalidation_du_slug(): void
    {
        $property = Property::factory()->published()->create();
        Queue::fake();

        $property->update(['price' => 123_456]);

        $this->assertSame([[$property->slug]], $this->slugsEnFile());
    }

    /**
     * Le slug ne suit PAS le titre dans ce code (`Property::booted()` ne le pose qu'à la
     * création) : le test change les deux, comme le ferait une correction d'annonce qui renomme.
     */
    public function test_changer_de_slug_invalide_l_ancien_et_le_nouveau(): void
    {
        $property = Property::factory()->published()->create(['title' => 'Ancien titre', 'slug' => 'ancien-titre-aaaaaa']);
        Queue::fake();

        $property->update(['title' => 'Nouveau titre', 'slug' => 'nouveau-titre-bbbbbb']);

        $this->assertSame([['nouveau-titre-bbbbbb', 'ancien-titre-aaaaaa']], $this->slugsEnFile());
    }

    /** Un retrait du public (statut) est un changement servi : le bien loué ne doit pas rester en cache. */
    public function test_un_changement_de_statut_ou_de_visibilite_invalide(): void
    {
        $property = Property::factory()->published()->create();
        Queue::fake();

        $property->update(['status' => 'rented']);
        $property->update(['visibility' => 'private']);
        $property->delete();

        $this->assertCount(3, $this->slugsEnFile());
    }

    /** Une vue ne met rien en file — ni par la route publique, ni par la route authentifiée. */
    public function test_une_vue_n_invalide_rien(): void
    {
        $property = Property::factory()->published()->create();
        Queue::fake();

        $this->postJson("/api/public/properties/{$property->slug}/view")->assertNoContent();

        Queue::assertNotPushed(RevalidatePublicPropertyPage::class);
    }

    /**
     * La liste d'exclusions, éprouvée pour elle-même : une vue ne passe pas par Éloquent, mais un
     * compteur incrémenté par le MODÈLE (favoris, ou un futur chemin) ne doit pas vider le cache.
     */
    public function test_un_compteur_incremente_par_le_modele_n_invalide_rien(): void
    {
        $property = Property::factory()->published()->create();
        Queue::fake();

        $property->increment('favorites_count');
        $property->increment('views_count');

        Queue::assertNotPushed(RevalidatePublicPropertyPage::class);
    }

    /** L'adresse vit sur son propre modèle, mais la fiche la sert (`location`). */
    public function test_modifier_l_adresse_du_bien_invalide(): void
    {
        $property = Property::factory()->published()->create();
        $adresse = Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => 'Dakar',
        ]);
        Queue::fake();

        $adresse->update(['neighborhood' => 'Mermoz']);

        $this->assertSame([[$property->slug]], $this->slugsEnFile());
    }

    /** Sans configuration, le job ne fait rien : ni appel, ni erreur. */
    public function test_le_job_sans_configuration_ne_fait_rien(): void
    {
        config(['services.public_cache.revalidate_url' => '', 'services.public_cache.revalidate_secret' => '']);
        Http::fake();

        (new RevalidatePublicPropertyPage(['un-bien']))->handle();

        Http::assertNothingSent();
    }

    /** Configuré, il poste les slugs, signés par HMAC de `<horodatage>.<corps>`. */
    public function test_le_job_poste_les_slugs_signes(): void
    {
        config([
            'services.public_cache.revalidate_url' => 'https://front.test/api/revalidation/fiche',
            'services.public_cache.revalidate_secret' => 'secret-de-test',
        ]);
        Http::fake(['front.test/*' => Http::response(['revalidated' => true])]);

        (new RevalidatePublicPropertyPage(['un-bien', 'un-bien', 'autre-bien']))->handle();

        Http::assertSent(function (RequeteSortante $requete) {
            $corps = $requete->body();
            preg_match('/^t=(\d+),v1=([0-9a-f]{64})$/', $requete->header('X-Takussan-Signature')[0] ?? '', $m);

            return $requete->url() === 'https://front.test/api/revalidation/fiche'
                && $corps === '{"slugs":["un-bien","autre-bien"]}'
                && $m !== []
                && hash_equals(hash_hmac('sha256', $m[1].'.'.$corps, 'secret-de-test'), $m[2]);
        });
    }

    /** Un refus du front fait échouer le job — et donc le réessayer. */
    public function test_un_refus_du_front_fait_echouer_le_job(): void
    {
        config([
            'services.public_cache.revalidate_url' => 'https://front.test/api/revalidation/fiche',
            'services.public_cache.revalidate_secret' => 'secret-de-test',
        ]);
        Http::fake(['front.test/*' => Http::response(['code' => 'invalid_signature'], 401)]);

        $this->expectException(RequestException::class);

        (new RevalidatePublicPropertyPage(['un-bien']))->handle();
    }
}
