<?php

namespace Tests\Feature\Public;

use App\Models\Enums\PropertyType;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
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
 *     la locale coche un AC2 littéral sans rien prouver. On vérifiait donc que
 *     les deux locales produisaient deux ETags DISTINCTS. TCK-351 a retiré les
 *     libellés traduits : les corps sont désormais IDENTIQUES, et c'est cette
 *     identité que les tests épinglent (cf. § AC2 ci-dessous).
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
     * LA mesure de TCK-341 — qui assertait la DIVERGENCE, et le disait : « si ce test rougit parce
     * que les deux corps sont devenus identiques, c'est une bonne nouvelle, et la décision doit
     * alors être RELUE ». **C'est arrivé avec TCK-598, et elle a été relue** (ADR-0052 §1,
     * commentaire de la route dans `routes/api/public.php`).
     *
     * Le test garde sa forme — un jeton Sanctum RÉEL, sur une route sans `auth:sanctum` — et
     * asserte désormais l'IDENTITÉ : `ResolveActiveProfile` propage toujours le porteur au garde
     * par défaut (TCK-179), mais `PropertyResource` ne lit plus l'appelant sur une route
     * `public.*`. Le cas du jeton du PROPRIÉTAIRE (qui ouvre `viewRaw`) est dans
     * `PropertyCollaboratorsNotExposedTest`.
     */
    public function test_la_fiche_publique_rend_le_meme_corps_a_un_porteur_de_jeton(): void
    {
        $bien = $this->bienPublie();
        $user = User::factory()->create();

        $anonyme = $this->getJson("/api/public/properties/{$bien->slug}")->assertOk();
        $porteur = $this->getJson("/api/public/properties/{$bien->slug}", $this->porteur($user))->assertOk();

        foreach (self::CHAMPS_AUTHENTIFIES as $champ) {
            $porteur->assertJsonMissingPath("data.{$champ}");
        }
        $this->assertSame($anonyme->getContent(), $porteur->getContent());
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
     * `show()` écrivait — elle incrémentait `views_count`, que la même ressource émet, et deux
     * appels identiques ne rendaient pas le même corps. TCK-598 a sorti le comptage de la lecture
     * (`POST …/view`, `PropertyViewCounter`) : deux appels identiques rendent désormais le même
     * corps, ce dont dépend le cache de données de la fiche côté front (ADR-0052).
     */
    public function test_deux_appels_anonymes_identiques_sur_la_fiche_rendent_le_meme_corps(): void
    {
        $bien = $this->bienPublie();

        $premier = $this->getJson("/api/public/properties/{$bien->slug}")->assertOk();
        $second = $this->getJson("/api/public/properties/{$bien->slug}")->assertOk();

        $this->assertSame(0, $premier->json('data.views_count'));
        $this->assertSame($premier->getContent(), $second->getContent(), 'show() ne doit plus rien écrire.');
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

    // ── AC2 — deux locales : relu par TCK-351 ────────────────────────────────

    /**
     * AC2 de TCK-341 reposait sur une PRÉMISSE : les libellés d'enum étaient traduits côté serveur
     * (TCK-335), donc le corps variait avec la locale, et ce test assertait deux ETags distincts.
     * **TCK-351 (2026-11-16) a retiré ces libellés** — le front possède le texte affiché — et la
     * prémisse est tombée : aucun champ de ces réponses ne dépend plus de la locale.
     *
     * Décision relue : sur `search` (`etag` seul, cache PRIVÉ), rien à garder. L'ETag est le hachage
     * du corps : deux locales au même corps partagent légitimement la même entrée, et le jour où un
     * texte localisé reviendrait, les ETags divergeraient d'eux-mêmes — aucune revalidation croisée
     * ne servirait la mauvaise langue.
     *
     * Ce test épingle donc l'IDENTITÉ, et c'est lui qui doit rougir si un texte localisé réapparaît
     * dans le catalogue : la décision de TCK-341 et celle-ci seraient alors à relire ensemble.
     */
    public function test_le_corps_de_search_ne_depend_plus_de_la_locale(): void
    {
        // Un type dont le mot change dans les trois langues (« Appartement », « Apartment », « Appart »
        // dans `lang/`) : avec une `villa`, identique partout, un libellé réémis passerait inaperçu.
        $this->bienPublie(['type' => PropertyType::Apartment]);
        $this->indexProperties();

        $fr = $this->getJson('/api/public/properties/search?per_page=20', ['Accept-Language' => 'fr'])->assertOk();
        $en = $this->getJson('/api/public/properties/search?per_page=20', ['Accept-Language' => 'en'])->assertOk();
        $wo = $this->getJson('/api/public/properties/search?per_page=20', ['Accept-Language' => 'wo'])->assertOk();

        $this->assertNotEmpty($fr->json('data'), 'Prémisse : un bien est rendu, sinon l\'identité ne prouve rien.');
        foreach (['en' => $en, 'wo' => $wo] as $locale => $reponse) {
            $this->assertSame(
                $fr->getContent(),
                $reponse->getContent(),
                "Un texte localisé est revenu dans search ({$locale}) : relire TCK-341 et TCK-351 — le front "
                .'possède le texte affiché, l\'API émet des codes.',
            );
        }

        // Même corps, même ETag : la revalidation croisée rend 304, et c'est juste.
        $etagFr = (string) $fr->headers->get('ETag');
        $this->assertNotSame('', $etagFr);
        $this->getJson('/api/public/properties/search?per_page=20', [
            'Accept-Language' => 'wo',
            'If-None-Match' => $etagFr,
        ])->assertStatus(304);
    }

    /**
     * `discovery` est la SEULE réponse `public` du catalogue (`s-maxage=300`) : un cache PARTAGÉ la
     * stocke. TCK-341 y avait posé `Vary: Accept-Language` parce que son corps variait avec la locale.
     *
     * TCK-351 — le corps ne varie plus (épinglé ci-dessous), mais **`Accept-Language` reste dans le
     * `Vary`, délibérément**. Le retirer n'achèterait qu'un facteur 3 sur le taux de succès d'un cache
     * à cinq minutes ; le garder protège du seul défaut qui ne se verrait pas : un texte localisé qui
     * reviendrait dans ce corps serait servi, sans lui, dans la langue du premier visiteur à tous les
     * suivants. Ce qui reste visible, c'est l'assertion d'identité : si elle rougit, la décision se relit.
     */
    public function test_discovery_ne_varie_plus_avec_la_locale_et_garde_son_vary(): void
    {
        $this->bienPublie(['type' => PropertyType::Apartment]);

        $fr = $this->getJson('/api/public/properties/discovery?per_row=3', ['Accept-Language' => 'fr'])->assertOk();
        $wo = $this->getJson('/api/public/properties/discovery?per_row=3', ['Accept-Language' => 'wo'])->assertOk();

        $this->assertStringContainsString('"id"', $fr->getContent(), 'Prémisse : discovery rend au moins un bien.');
        $this->assertSame(
            $fr->getContent(),
            $wo->getContent(),
            'Un texte localisé est revenu dans discovery : relire TCK-341 et TCK-351 (le `Vary` le couvre encore).',
        );
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

        // Le CORS n'ajoute `Vary: Origin` que s'il RENVOIE l'origine reçue — plusieurs origines
        // admises, ou un motif. Une origine seule est posée telle quelle, sans `Vary` (fruitcake/php-cors,
        // `isSingleOriginAllowed`) : c'est le cas réel depuis TCK-860, qui a retiré le motif `*.vercel.app`.
        // Deux origines, pour que le défaut gardé ici — un `Vary` qui ÉCRASE au lieu d'ajouter — reste visible.
        config(['cors.allowed_origins' => ['http://localhost:3000', 'https://autre-front.test']]);

        $reponse = $this->getJson('/api/public/properties/discovery?per_row=3', [
            'Origin' => 'http://localhost:3000',
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

    /** @return array<string, array{string}> */
    public static function referentiel(): array
    {
        return [
            'villes' => ['/api/public/geo/cities'],
            'régions' => ['/api/public/geo/regions'],
            'équipements' => ['/api/public/amenities'],
            'types de bien' => ['/api/public/property-types'],
        ];
    }

    /**
     * TCK-1207 (P103.03, ex-`ReferentielPublicCacheTest`, versé par TCK-3017) — les listes du référentiel
     * public sortent en cache public de cinq minutes, avec un `ETag`, comme les énumérations. Avant :
     * `no-cache, private`, sans `ETag`, retéléchargées à chaque page.
     */
    #[DataProvider('referentiel')]
    public function test_le_referentiel_sort_en_cache_public_avec_un_etag(string $url): void
    {
        $headers = $this->getJson($url)->assertOk()->headers;

        // Directive par directive : Symfony réordonne `Cache-Control` (cf. HomepageDiscoveryTest).
        $this->assertTrue($headers->hasCacheControlDirective('public'), $url);
        $this->assertSame('300', $headers->getCacheControlDirective('max-age'), $url);
        $this->assertFalse($headers->hasCacheControlDirective('private'), $url);
        $this->assertFalse($headers->hasCacheControlDirective('no-cache'), $url);
        $this->assertNotNull($headers->get('ETag'), $url);
    }
}
