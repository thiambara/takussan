<?php

namespace Tests\Unit\Http\Middleware;

use App\Http\Middleware\SetLocaleMiddleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

/**
 * TCK-335 — la négociation de locale, **y compris le cas que le harnais HTTP ne sait pas
 * produire** : une requête sans `Accept-Language`.
 *
 * ⚠️ **La raison d'être de ce fichier est une mesure, pas un goût pour le test unitaire.**
 * Le 2026-08-21, un test de `PropertyLabelLocaleTest` prétendait couvrir ce cas par
 * `$this->getJson($uri)` sans en-tête. Il ne le couvrait pas, et il a cassé la CI de la
 * PR #209 :
 *
 *     Illuminate\Http\Request::create('/x')->header('Accept-Language')  =>  "en-us,en;q=0.5"
 *
 * `Request::create()` — la fabrique de tous les tests HTTP de Laravel — injecte cet en-tête
 * parmi ses valeurs de serveur par défaut, et `array_replace` ne sait pas le retirer. Le test
 * mesurait donc `en` en croyant mesurer `app.locale` : vert en local (`.env` → `en`), rouge
 * en CI (`.env.example` → `fr`).
 *
 * Ici la requête est construite puis **dépouillée** de l'en-tête — côté `headers` ET côté
 * `server`, les deux portent la valeur — ce qui rend le cas réel enfin observable. Et la
 * locale d'application est posée à `wo` : une valeur qu'aucun des deux environnements ne
 * déclare, donc qu'aucun défaut du harnais ne peut faire coïncider par accident.
 */
class SetLocaleMiddlewareTest extends TestCase
{
    /**
     * Épingle la propriété du harnais qui a coûté la CI, pour que le prochain test « sans
     * en-tête » écrit en HTTP échoue ICI, avec son explication, plutôt que six semaines plus
     * tard sur une machine dont le `.env` ne dit pas la même chose.
     */
    public function test_le_harnais_http_injecte_toujours_un_accept_language(): void
    {
        $this->assertNotNull(
            Request::create('/api/public/properties/x')->header('Accept-Language'),
            "Request::create() n'injecte plus d'Accept-Language : un test HTTP peut désormais ".
            'exprimer directement le cas « aucun en-tête ».',
        );
    }

    public function test_sans_accept_language_la_locale_de_lapplication_est_conservee(): void
    {
        app()->setLocale('wo');

        $this->passe($this->requeteSansAcceptLanguage());

        $this->assertSame('wo', app()->getLocale());
    }

    public function test_un_accept_language_non_supporte_conserve_la_locale_de_lapplication(): void
    {
        app()->setLocale('wo');

        $this->passe($this->requete('de-DE,de;q=0.9'));

        $this->assertSame('wo', app()->getLocale());
    }

    /**
     * L'ablation du correctif se joue ici : un middleware qui poserait une locale codée en
     * dur — ou qui n'en poserait aucune — laisse ce test rouge.
     */
    public function test_un_accept_language_supporte_est_negocie(): void
    {
        app()->setLocale('wo');

        $this->passe($this->requete('fr-FR,fr;q=0.9,en;q=0.5'));

        $this->assertSame('fr', app()->getLocale());
    }

    public function test_le_facteur_q_ordonne_les_candidats(): void
    {
        app()->setLocale('wo');

        $this->passe($this->requete('en;q=0.6,fr;q=0.9'));

        $this->assertSame('fr', app()->getLocale());
    }

    public function test_le_parametre_lang_prime_sur_len_tete(): void
    {
        app()->setLocale('wo');

        $this->passe($this->requete('fr', '?lang=en'));

        $this->assertSame('en', app()->getLocale());
    }

    private function requete(string $acceptLanguage, string $queryString = ''): Request
    {
        return Request::create(
            '/api/public/properties/x'.$queryString,
            'GET',
            server: ['HTTP_ACCEPT_LANGUAGE' => $acceptLanguage],
        );
    }

    /**
     * Une requête à laquelle l'en-tête a été RETIRÉ — le seul moyen de l'obtenir, la valeur
     * étant injectée par la fabrique elle-même. Les deux sacs sont dépouillés : `header()`
     * lit `headers`, mais un `server` resté garni le reconstituerait à la première copie.
     */
    private function requeteSansAcceptLanguage(): Request
    {
        $request = Request::create('/api/public/properties/x');
        $request->headers->remove('Accept-Language');
        $request->server->remove('HTTP_ACCEPT_LANGUAGE');

        $this->assertNull($request->header('Accept-Language'));

        return $request;
    }

    private function passe(Request $request): void
    {
        $suivantAppele = false;

        (new SetLocaleMiddleware)->handle($request, function () use (&$suivantAppele): Response {
            $suivantAppele = true;

            return new Response;
        });

        $this->assertTrue($suivantAppele, 'le middleware doit passer la main au maillon suivant');
    }
}
