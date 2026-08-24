<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * TCK-341 — ce que le catalogue public autorise un cache à faire, et surtout ce
 * qu'il ne l'autorise PAS à faire.
 *
 * ⚠ Ce fichier existe d'abord pour un REFUS. Le ticket demandait
 * `Cache-Control: public` sur `/public/properties/search` ET sur
 * `/public/properties/{slug}` ; les deux ont été refusées, et la première
 * assertion ci-dessous est la mesure qui l'établit — pas une opinion.
 *
 * ── LA MESURE ──────────────────────────────────────────────────────────────
 *
 * `PropertyResource` émet quatre champs de modération, plus l'e-mail d'un
 * collaborateur, dès que `$request->user() !== null`. On pouvait croire les
 * routes publiques hors d'atteinte : elles ne portent pas `auth:sanctum`, le
 * garde par défaut est `web` (session), et le groupe `api` ne monte pas
 * `StartSession`. **C'est faux, et c'est mesuré ici.**
 * `ResolveActiveProfile:39-56` résout DÉLIBÉRÉMENT un porteur Bearer et le
 * pose sur le garde par défaut (`Auth::setUser()`), sur tout `api/*`, pour que
 * les endpoints à authentification OPTIONNELLE fonctionnent (TCK-179).
 *
 * Conséquence : un cache PARTAGÉ qui stockerait une réponse authentifiée la
 * resservirait au visiteur anonyme suivant, défaisant en silence ce que
 * TCK-335 venait de retirer.
 *
 * ── LA QUESTION POSÉE À CHAQUE ASSERTION ───────────────────────────────────
 *
 * *« une régression silencieuse la cocherait-elle aussi ? »* Deux pièges ont
 * été fermés à ce titre, et ils gouvernent la forme des tests :
 *
 *   · un ETag CONSTANT rendrait 304 à tous les coups et cocherait un AC1 écrit
 *     naïvement — pire que pas d'ETag du tout, puisqu'il servirait du périmé.
 *     On vérifie donc AUSSI qu'il CHANGE quand le corps change ;
 *   · `Vary: Accept-Language` sur une réponse dont le corps ne varie PAS avec
 *     la locale coche un AC2 littéral sans rien prouver. On vérifie donc que
 *     les deux locales produisent deux ETags DISTINCTS — c'est ce que « ne
 *     partagent pas la même entrée de cache » veut dire.
 */
class CataloguePublicCacheTest extends ApiTestCase
{
    // `search` passe par Scout : sans ce concern, la synchronisation coupée par
    // `Tests\TestCase::setUp()` (D-44) laisse l'index inexistant et la route rend 500.
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** Les quatre champs que `PropertyResource` ne montre qu'à un appelant authentifié. */
    private const CHAMPS_AUTHENTIFIES = ['rejection_reason', 'submitted_at', 'approved_at', 'rejected_at'];

    private function bienPublie(array $attributs = []): Property
    {
        return Property::factory()->published()->create($attributs + [
            'submitted_at' => now()->subDays(3),
            'approved_at' => now()->subDay(),
            'rejected_at' => now()->subDays(2),
            'rejection_reason' => 'Photos illisibles.',
        ]);
    }

    /** Un vrai jeton Sanctum, pas `actingAs()` : c'est le chemin de production. */
    private function porteur(User $user): array
    {
        return ['Authorization' => 'Bearer '.$user->createToken('tck-341')->plainTextToken];
    }

    /**
     * LA mesure du ticket. Elle ASSERTE LA DIVERGENCE, et c'est délibéré.
     *
     * `actingAs()` ne prouverait rien ici : il pose l'utilisateur sur le garde,
     * ce qui rend la variance trivialement vraie. On envoie donc un jeton
     * Sanctum réel sur une route SANS `auth:sanctum` — exactement ce qu'un
     * navigateur connecté fait en visitant une fiche publique.
     *
     * ⚠ SI CE TEST ROUGIT PARCE QUE LES DEUX CORPS SONT DEVENUS IDENTIQUES,
     * c'est une bonne nouvelle et non une régression : cela voudra dire que
     * `PropertyResource` ne dépend plus de l'appelant, et la décision de
     * TCK-341 (« ni `public` ni ETag sur `{slug}` ») doit alors être RELUE,
     * pas contournée.
     */
    public function test_la_fiche_publique_repond_un_corps_different_a_un_porteur_de_jeton(): void
    {
        $bien = $this->bienPublie();
        $user = User::factory()->create();

        $anonyme = $this->getJson("/api/public/properties/{$bien->slug}")->assertOk();
        $porteur = $this->getJson("/api/public/properties/{$bien->slug}", $this->porteur($user))->assertOk();

        $clesAnonymes = array_keys((array) $anonyme->json('data'));
        $clesPorteur = array_keys((array) $porteur->json('data'));

        $this->assertSame(
            self::CHAMPS_AUTHENTIFIES,
            array_values(array_diff($clesPorteur, $clesAnonymes)),
            'Un JETON SANCTUM RÉEL suffit à changer le corps de `/public/properties/{slug}`, alors que '
            .'la route ne porte pas `auth:sanctum` : `ResolveActiveProfile` propage le porteur au garde '
            .'par défaut (TCK-179). Tant que cette divergence existe, la route ne peut pas devenir '
            .'`Cache-Control: public` — un cache partagé resservirait la variante authentifiée.',
        );

        $this->assertNotSame($anonyme->getContent(), $porteur->getContent());
    }

    /**
     * La conséquence, épinglée séparément de sa cause : tant que le corps
     * varie, la réponse n'autorise aucun cache PARTAGÉ.
     *
     * Le test lit l'en-tête RÉELLEMENT ÉMIS plutôt que la définition de la
     * route : c'est l'en-tête qui décide, et il peut venir du middleware comme
     * du contrôleur.
     */
    public function test_la_fiche_publique_n_autorise_aucun_cache_partage(): void
    {
        $bien = $this->bienPublie();

        $entete = (string) $this->getJson("/api/public/properties/{$bien->slug}")
            ->assertOk()
            ->headers->get('Cache-Control');

        $this->assertStringNotContainsString('public', $entete, "Cache-Control émis : « {$entete} »");
        $this->assertStringNotContainsString('s-maxage', $entete, "Cache-Control émis : « {$entete} »");
    }

    /**
     * `show()` ÉCRIT — elle incrémente `views_count`, que la même ressource
     * émet. Deux appels anonymes identiques ne rendent donc pas le même corps.
     * C'est la seconde raison, indépendante de la première, pour laquelle un
     * ETag n'aurait rien à garantir ici.
     */
    public function test_deux_appels_anonymes_identiques_sur_la_fiche_ne_rendent_pas_le_meme_corps(): void
    {
        $bien = $this->bienPublie();

        $premier = $this->getJson("/api/public/properties/{$bien->slug}")->assertOk();
        $second = $this->getJson("/api/public/properties/{$bien->slug}")->assertOk();

        $this->assertSame(1, $premier->json('data.views_count'));
        $this->assertSame(2, $second->json('data.views_count'), 'show() incrémente views_count et le sérialise.');
        $this->assertNotSame($premier->getContent(), $second->getContent());
    }

    // ── AC1 — la revalidation ────────────────────────────────────────────────

    /**
     * AC1, mais en DEUX temps. « Une seconde requête identique portant
     * `If-None-Match` rend 304 » est cochable par un ETag constant, qui
     * rendrait 304 même après un changement de catalogue — un cache empoisonné
     * plutôt qu'un cache. La seconde moitié est celle qui compte.
     */
    public function test_une_seconde_requete_identique_avec_if_none_match_rend_304(): void
    {
        $this->bienPublie(['title' => 'Villa de test A']);
        $this->indexProperties();

        $premier = $this->getJson('/api/public/properties/search?per_page=20')->assertOk();
        $etag = (string) $premier->headers->get('ETag');
        $this->assertNotSame('', $etag, 'La route search doit émettre un ETag (cache.headers:etag).');

        $this->getJson('/api/public/properties/search?per_page=20', ['If-None-Match' => $etag])
            ->assertStatus(304);
    }

    public function test_l_etag_change_quand_le_catalogue_change(): void
    {
        $this->bienPublie(['title' => 'Villa de test A']);
        $this->indexProperties();

        $premier = $this->getJson('/api/public/properties/search?per_page=20')->assertOk();
        $etagAvant = (string) $premier->headers->get('ETag');

        // Prémisse : le premier appel a bien RENVOYÉ quelque chose. Sans elle, un
        // index vide rendrait deux fois la même liste vide, l'ETag ne bougerait pas,
        // et le test rougirait en accusant l'ETag d'un défaut d'indexation.
        $this->assertNotEmpty($premier->json('data'));

        $this->bienPublie(['title' => 'Villa de test B']);
        $this->indexProperties();

        $apres = $this->getJson('/api/public/properties/search?per_page=20', ['If-None-Match' => $etagAvant]);

        $apres->assertOk();
        $this->assertNotSame(
            $etagAvant,
            (string) $apres->headers->get('ETag'),
            "Un ETag qui ne bouge pas quand le catalogue bouge rendrait 304 sur du périmé : c'est PIRE "
            .'que pas de cache du tout, et un AC1 écrit naïvement le cocherait.',
        );
    }

    /**
     * L'autre moitié de la décision : la revalidation est obtenue SANS ouvrir
     * la réponse à un cache partagé. `cache.headers:etag` seul laisse
     * `Cache-Control: no-cache, private` — le navigateur revalide, aucun proxy
     * ne mutualise.
     */
    public function test_la_revalidation_de_search_n_ouvre_aucun_cache_partage(): void
    {
        $this->bienPublie();
        $this->indexProperties();

        $entete = (string) $this->getJson('/api/public/properties/search?per_page=20')
            ->assertOk()->headers->get('Cache-Control');

        $this->assertStringNotContainsString('public', $entete, "Cache-Control émis : « {$entete} »");
        $this->assertStringNotContainsString('s-maxage', $entete, "Cache-Control émis : « {$entete} »");
    }

    // ── AC2 — deux locales, deux entrées ─────────────────────────────────────

    /**
     * AC2 pris au mot : « deux locales différentes ne partagent pas la même
     * entrée de cache ». La clé d'entrée d'un validateur, c'est l'ETag — donc
     * on vérifie que l'ETag du français ne vaut PAS revalidation en wolof.
     * Assertion sur `Vary` seul : une tautologie, l'en-tête peut être posé sur
     * une réponse qui ne varie pas.
     */
    public function test_deux_locales_ne_partagent_pas_la_meme_entree_de_cache_sur_search(): void
    {
        $this->bienPublie();
        $this->indexProperties();

        $fr = $this->getJson('/api/public/properties/search?per_page=20', ['Accept-Language' => 'fr'])->assertOk();
        $wo = $this->getJson('/api/public/properties/search?per_page=20', ['Accept-Language' => 'wo'])->assertOk();

        $this->assertNotSame(
            $fr->getContent(),
            $wo->getContent(),
            'Les libellés d\'enum sont traduits (TCK-335) : si les deux corps deviennent identiques, '
            .'la prémisse de TCK-341 a changé et la décision doit être relue.',
        );

        $etagFr = (string) $fr->headers->get('ETag');
        $this->assertNotSame($etagFr, (string) $wo->headers->get('ETag'));

        $this->getJson('/api/public/properties/search?per_page=20', [
            'Accept-Language' => 'wo',
            'If-None-Match' => $etagFr,
        ])->assertOk();
    }

    /**
     * `discovery` est la SEULE réponse `public` du catalogue, et c'est le seul
     * défaut de ce ticket qui vivait réellement en production : servie
     * `public, max-age=60, s-maxage=300` avec un corps qui varie avec la
     * locale depuis TCK-335, et un `Vary` réduit à `Origin`.
     */
    public function test_discovery_varie_avec_la_locale_et_le_declare(): void
    {
        $this->bienPublie();

        $fr = $this->getJson('/api/public/properties/discovery?per_row=3', ['Accept-Language' => 'fr'])->assertOk();
        $wo = $this->getJson('/api/public/properties/discovery?per_row=3', ['Accept-Language' => 'wo'])->assertOk();

        $this->assertNotSame($fr->getContent(), $wo->getContent(), 'Prémisse : discovery varie avec la locale.');
        $this->assertStringContainsString('public', (string) $fr->headers->get('Cache-Control'));

        $vary = array_map('trim', explode(',', (string) $fr->headers->get('Vary')));
        $this->assertContains('Accept-Language', $vary, 'Vary émis : '.$fr->headers->get('Vary'));
        $this->assertContains('Authorization', $vary, 'Vary émis : '.$fr->headers->get('Vary'));
    }

    /**
     * Le `Vary` s'AJOUTE, il ne remplace pas : `Origin` y est posé par le
     * middleware CORS, et l'écraser casserait le CORS sans casser un seul test
     * de CORS — aucun n'inspecte `Vary`.
     */
    public function test_le_vary_de_discovery_ne_chasse_pas_l_origin_pose_par_le_cors(): void
    {
        $this->bienPublie();

        $reponse = $this->getJson('/api/public/properties/discovery?per_row=3', [
            'Origin' => config('cors.allowed_origins')[0] ?? 'http://localhost:3000',
        ])->assertOk();

        $vary = array_map('trim', explode(',', (string) $reponse->headers->get('Vary')));

        $this->assertContains('Origin', $vary, 'Vary émis : '.$reponse->headers->get('Vary'));
        $this->assertContains('Accept-Language', $vary, 'Vary émis : '.$reponse->headers->get('Vary'));
        $this->assertNotNull($reponse->headers->get('Access-Control-Allow-Origin'));
    }

    // ── AC3 — aucune surface authentifiée ne devient cacheable ───────────────

    /**
     * AC3 tel que le ticket l'écrivait — « aucune surface authentifiée ne
     * devient cacheable par ce changement » — est une TAUTOLOGIE : il est vrai
     * avant d'écrire la moindre ligne, et il le resterait si on rendait demain
     * `/api/me` cacheable, puisque ce ne serait plus « par ce changement ».
     *
     * Réécrit en propriété vérifiable, sans référence au changement : AUCUNE
     * route de l'application, à aucun moment, ne porte à la fois un middleware
     * d'authentification et un `cache.headers` de cache partagé. Le test
     * interroge le ROUTEUR RÉEL — la garde `scripts/check-cache-headers-auth.mjs`
     * lit les fichiers ; les deux se trompent différemment, et c'est le but.
     */
    public function test_aucune_route_authentifiee_n_est_cacheable_par_un_cache_partage(): void
    {
        $fautives = [];
        $authentifiees = 0;
        $partagees = 0;

        foreach (Route::getRoutes() as $route) {
            // ⚠ `$route->gatherMiddleware()` ne RÉSOUT PAS les alias : il rend
            // « cache.headers:… » là où le routeur rend le FQCN. On passe donc par le
            // routeur, comme `artisan route:list` — sinon le test compte zéro route de
            // cache partagé et passe au vert sans rien comparer (mesuré).
            $middlewares = Route::gatherRouteMiddleware($route);

            // Le routeur rend le FQCN résolu : `auth:sanctum` devient
            // « Illuminate\Auth\Middleware\Authenticate:sanctum ». On reconnaît les
            // DEUX orthographes plutôt que de parier sur celle du jour.
            $auth = array_values(array_filter($middlewares, fn ($m) => is_string($m)
                && (str_starts_with($m, 'auth:') || $m === 'auth'
                    || str_contains($m, 'Middleware\\Authenticate')
                    || str_contains($m, 'EnsureSuperAdmin') || $m === 'super-admin')));

            $partage = array_values(array_filter($middlewares, fn ($m) => is_string($m)
                && str_contains($m, 'SetCacheHeaders')
                && (str_contains($m, 'public') || str_contains($m, 's_maxage'))));

            if ($auth !== []) {
                $authentifiees++;
            }
            if ($partage !== []) {
                $partagees++;
            }
            if ($auth !== [] && $partage !== []) {
                $fautives[] = $route->uri().' → '.implode(', ', array_merge($auth, $partage));
            }
        }

        // Non-vacuité : sans les deux moitiés, l'assertion ci-dessous est vraie
        // sans rien garder — c'est ainsi qu'un test devient une case à cocher.
        $this->assertGreaterThan(80, $authentifiees, 'Le routeur ne rend plus de routes authentifiées.');
        $this->assertGreaterThan(0, $partagees, 'Plus aucune route de cache partagé : le test ne compare plus rien.');

        $this->assertSame([], $fautives, "Route(s) à la fois authentifiée(s) et cacheable(s) par un cache partagé :\n".implode("\n", $fautives));
    }

    /**
     * Le versant vivant du même AC : une surface authentifiée réelle, appelée
     * avec un vrai jeton, ne rend aucun en-tête de cache partagé. Le contrôle
     * sur le routeur ci-dessus ne voit pas les en-têtes posés à la main dans un
     * contrôleur ; celui-ci les voit tous, sur une route.
     */
    public function test_une_surface_authentifiee_reelle_ne_rend_aucun_entete_de_cache_partage(): void
    {
        $user = User::factory()->create();

        $reponse = $this->getJson('/api/me/capabilities', $this->porteur($user))->assertOk();
        $entete = (string) $reponse->headers->get('Cache-Control');

        $this->assertStringNotContainsString('public', $entete, "Cache-Control émis : « {$entete} »");
        $this->assertStringNotContainsString('s-maxage', $entete, "Cache-Control émis : « {$entete} »");
    }
}
