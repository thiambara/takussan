<?php

namespace Tests\Feature\Architecture;

use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Auth\Middleware\AuthenticateWithBasicAuth;
use Illuminate\Routing\Route;
use Illuminate\Routing\Router;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use Tests\TestCase;

/**
 * TCK-2787 (AC6) — aucun guard `token` : l'avis critique de laravel/framework < 13.27.0
 * (GHSA-f9x3-7vq9-cph6, contournement du `TokenGuard`) ne touche une application que si l'un de ses
 * guards a le driver `token`. Le relevé du 2026-11-13 l'a jugé inatteignable ici : deux guards, `web`
 * (session) et `sanctum`, et toutes les routes authentifiées sous `auth:sanctum`. Cette garde fige ce
 * verdict, pour qu'il ne se périme pas en silence :
 *
 * 1. les guards configurés sont exactement `GUARDS` (driver par guard) ;
 * 2. aucun `TokenGuard`, `RequestGuard`, `createTokenDriver`, `viaRequest` ni `Auth::extend` dans le
 *    CODE (commentaires ignorés) de `app/`, `config/`, `bootstrap/` et `routes/` ;
 * 3. toute route dont la pile résolue (groupes et alias dépliés, middleware de contrôleur compris)
 *    porte un middleware d'authentification le porte sous le seul guard `sanctum` — `auth` sans
 *    paramètre (guard par défaut), `auth:api` ou `auth.basic` rougissent ;
 * 4. une route `api/*` sans authentification figure dans `SANS_AUTHENTIFICATION`, liste FERMÉE dont
 *    chaque entrée dit pourquoi ; une entrée qui ne correspond plus à une route sans authentification
 *    en sort.
 *
 * Le guard `sanctum` lui-même passe par `RequestGuard` : il est fourni par le paquet, pas par `app/`.
 */
class AucunGuardTokenTest extends TestCase
{
    /** Les guards de `config('auth.guards')`, avec leur driver. */
    private const GUARDS = [
        'web' => 'session',
        'sanctum' => 'sanctum',
    ];

    private const ENTREE = 'entrée de session';

    private const PUBLIQUE = 'site public, sans compte';

    private const JETON = 'jeton de capacité dans l\'URL';

    private const SIGNEE = 'URL signée';

    private const WEBHOOK = 'webhook entrant';

    /**
     * Les routes `api/*` sans middleware d'authentification, relevées le 2026-11-13 (97). « MÉTHODES uri »,
     * HEAD omis.
     *
     * @var array<string, string>
     */
    private const SANS_AUTHENTIFICATION = [
        // On s'y authentifie : la session n'existe pas encore.
        'POST api/auth/forgot-password' => self::ENTREE,
        'POST api/auth/login' => self::ENTREE,
        'POST api/auth/oauth/2fa' => self::ENTREE,
        'GET|POST api/auth/oauth/apple/callback' => self::ENTREE,
        'GET api/auth/oauth/apple/redirect' => self::ENTREE,
        'GET api/auth/oauth/facebook/callback' => self::ENTREE,
        'GET api/auth/oauth/facebook/redirect' => self::ENTREE,
        'GET api/auth/oauth/providers' => self::ENTREE,
        'GET api/auth/oauth/{provider}/callback' => self::ENTREE,
        'GET api/auth/oauth/{provider}/redirect' => self::ENTREE,
        'POST api/auth/phone/request-code' => self::ENTREE,
        'POST api/auth/phone/verify-code' => self::ENTREE,
        'POST api/auth/register' => self::ENTREE,
        'POST api/auth/reset-password' => self::ENTREE,
        // Lecture ou geste du site public, sans compte (ResolveActiveProfile lit un Bearer éventuel par le guard sanctum).
        'GET api/enums/{key}' => self::PUBLIQUE,
        'GET api/health' => self::PUBLIQUE,
        'GET api/maintenance/status' => self::PUBLIQUE,
        'GET api/public/agencies' => self::PUBLIQUE,
        'GET api/public/agencies/{slug}' => self::PUBLIQUE,
        'GET api/public/agencies/{slug}/properties' => self::PUBLIQUE,
        'GET api/public/agents' => self::PUBLIQUE,
        'GET api/public/agents/{slug}' => self::PUBLIQUE,
        'POST api/public/agents/{slug}/contact-lead' => self::PUBLIQUE,
        'GET api/public/agents/{slug}/properties' => self::PUBLIQUE,
        'GET api/public/amenities' => self::PUBLIQUE,
        'GET api/public/geo/cities' => self::PUBLIQUE,
        'GET api/public/geo/cities/{city}' => self::PUBLIQUE,
        'GET api/public/geo/neighborhoods' => self::PUBLIQUE,
        'GET api/public/geo/regions' => self::PUBLIQUE,
        'POST api/public/geo/resolve-link' => self::PUBLIQUE,
        'GET api/public/properties' => self::PUBLIQUE,
        'GET api/public/properties/by-ids' => self::PUBLIQUE,
        'GET api/public/properties/cities' => self::PUBLIQUE,
        'GET api/public/properties/compare' => self::PUBLIQUE,
        'GET api/public/properties/discovery' => self::PUBLIQUE,
        'GET api/public/properties/map' => self::PUBLIQUE,
        'GET api/public/properties/neighborhoods' => self::PUBLIQUE,
        'GET api/public/properties/price-distribution' => self::PUBLIQUE,
        'GET api/public/properties/search' => self::PUBLIQUE,
        'GET api/public/properties/sitemap' => self::PUBLIQUE,
        'GET api/public/properties/{property}/documents/{document}/file' => self::PUBLIQUE,
        'GET api/public/properties/{slug}' => self::PUBLIQUE,
        'GET api/public/properties/{slug}/availability' => self::PUBLIQUE,
        'GET api/public/properties/{slug}/contact' => self::PUBLIQUE,
        'POST api/public/properties/{slug}/contact-click' => self::PUBLIQUE,
        'POST api/public/properties/{slug}/contact-lead' => self::PUBLIQUE,
        'POST api/public/properties/{slug}/report' => self::PUBLIQUE,
        'GET api/public/properties/{slug}/review-eligibility' => self::PUBLIQUE,
        'GET api/public/properties/{slug}/reviews' => self::PUBLIQUE,
        'GET api/public/properties/{slug}/similar' => self::PUBLIQUE,
        'GET api/public/properties/{slug}/status' => self::PUBLIQUE,
        'POST api/public/properties/{slug}/view' => self::PUBLIQUE,
        'POST api/public/properties/{slug}/visit-request' => self::PUBLIQUE,
        'GET api/public/properties/{slug}/visit-slots' => self::PUBLIQUE,
        'GET api/public/property-types' => self::PUBLIQUE,
        'POST api/public/reviews/{review}/report' => self::PUBLIQUE,
        'POST api/public/search-alerts' => self::PUBLIQUE,
        'GET api/public/search-alerts/capabilities' => self::PUBLIQUE,
        'GET api/search/suggest' => self::PUBLIQUE,
        'GET api/settings/public' => self::PUBLIQUE,
        // Un jeton de capacité dans l'URL (lien de paiement, partage, invitation, réclamation, alerte, agenda).
        'GET api/calendar-feed/{token}.ics' => self::JETON,
        'POST api/invitations/{token}/accept' => self::JETON,
        'GET api/pay/{token}' => self::JETON,
        'POST api/pay/{token}/initiate' => self::JETON,
        'GET api/pay/{token}/receipt' => self::JETON,
        'POST api/pay/{token}/verify' => self::JETON,
        'GET api/public/invitations/{token}' => self::JETON,
        'POST api/public/invitations/{token}/code' => self::JETON,
        'POST api/public/invitations/{token}/renewal-request' => self::JETON,
        'POST api/public/invitations/{token}/verify' => self::JETON,
        'GET api/public/search-alerts/by-token' => self::JETON,
        'POST api/public/search-alerts/confirm' => self::JETON,
        'POST api/public/search-alerts/frequency' => self::JETON,
        'POST api/public/search-alerts/unsubscribe' => self::JETON,
        'GET api/radar/claims/{token}' => self::JETON,
        'POST api/radar/claims/{token}/confirm' => self::JETON,
        'POST api/radar/claims/{token}/decline' => self::JETON,
        'POST api/radar/claims/{token}/otp' => self::JETON,
        'GET api/share/{token}' => self::JETON,
        'POST api/share/{token}' => self::JETON,
        'GET api/share/{token}/download' => self::JETON,
        'POST api/share/{token}/download' => self::JETON,
        // Une URL signée (ValidateSignature, ou hasValidSignature() dans l'action).
        'GET api/activity-logs/export/download' => self::SIGNEE,
        'GET api/auth/verify-email/{id}/{hash}' => self::SIGNEE,
        'GET api/media/{media}/file' => self::SIGNEE,
        'POST api/notifications/digest/unsubscribe/{user}' => self::SIGNEE,
        'GET api/report-exports/{reportExport}/download' => self::SIGNEE,
        'POST api/saved-searches/{savedSearch}/unsubscribe' => self::SIGNEE,
        // Webhook entrant d'un fournisseur : jeton de chemin, liste d'IP ou signature.
        'POST api/webhooks/payments/{provider}' => self::WEBHOOK,
        'POST api/webhooks/payments/{provider}/{token}' => self::WEBHOOK,
        'GET api/webhooks/sms/lafricamobile/status/{token}/{notification}' => self::WEBHOOK,
        'POST api/webhooks/sms/mtarget/status/{token}' => self::WEBHOOK,
        'POST api/webhooks/sms/orange/status/{token}' => self::WEBHOOK,
        'GET api/webhooks/whatsapp/radar/{token}' => self::WEBHOOK,
        'POST api/webhooks/whatsapp/radar/{token}' => self::WEBHOOK,
        'GET api/webhooks/whatsapp/status/{token}' => self::WEBHOOK,
        'POST api/webhooks/whatsapp/status/{token}' => self::WEBHOOK,
    ];

    /** Ce que le code ne doit pas nommer : chacun ouvre un guard hors de Sanctum. */
    private const MOTIFS_INTERDITS = '/\\b(TokenGuard|RequestGuard|createTokenDriver|viaRequest)\\b|\\bAuth::extend\\b|[\'"]driver[\'"]\\s*=>\\s*[\'"]token[\'"]/';

    public function test_les_guards_configures_sont_exactement_ceux_attendus(): void
    {
        $guards = array_map(fn (array $guard) => $guard['driver'] ?? null, (array) config('auth.guards'));
        ksort($guards);
        $attendus = self::GUARDS;
        ksort($attendus);

        $this->assertSame($attendus, $guards, "Un guard a été ajouté ou a changé de driver. Un driver « token » rouvre GHSA-f9x3-7vq9-cph6 (TCK-2787) ; tout autre guard se décide, puis s'écrit dans GUARDS.");
        $this->assertSame('web', config('auth.defaults.guard'));
    }

    public function test_aucun_guard_hors_sanctum_n_est_cree_dans_le_code(): void
    {
        $fautifs = [];
        foreach (['app', 'config', 'bootstrap', 'routes'] as $dossier) {
            foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator(base_path($dossier))) as $fichier) {
                if ($fichier->getExtension() !== 'php' || str_contains($fichier->getPathname(), DIRECTORY_SEPARATOR.'cache'.DIRECTORY_SEPARATOR)) {
                    continue;
                }
                if (preg_match(self::MOTIFS_INTERDITS, $this->codeSansCommentaires((string) file_get_contents($fichier->getPathname())), $m) === 1) {
                    $fautifs[] = substr($fichier->getPathname(), strlen(base_path()) + 1).' : '.$m[0];
                }
            }
        }

        $this->assertSame([], $fautifs, "Un guard hors de Sanctum est créé dans le code (TCK-2787, AC6) :\n".implode("\n", $fautifs));
    }

    public function test_toute_route_authentifiee_l_est_sous_le_seul_guard_sanctum(): void
    {
        $fautives = [];
        foreach ($this->routes() as $route) {
            foreach ($this->guardsDAuthentification($route) as $guards) {
                if ($guards !== ['sanctum']) {
                    $fautives[] = $this->cle($route).' → '.($guards === [] ? 'guard par défaut' : implode(',', $guards));
                }
            }
        }

        $this->assertSame([], $fautives, "Routes authentifiées hors du guard sanctum (TCK-2787, AC6) :\n".implode("\n", $fautives));
    }

    public function test_une_route_api_sans_authentification_est_dans_la_liste_fermee(): void
    {
        $ouvertes = [];
        foreach ($this->routes() as $route) {
            if (str_starts_with($route->uri(), 'api/') && $this->guardsDAuthentification($route) === []) {
                $ouvertes[$this->cle($route)] = true;
            }
        }

        $neuves = array_keys(array_diff_key($ouvertes, self::SANS_AUTHENTIFICATION));
        $mortes = array_keys(array_diff_key(self::SANS_AUTHENTIFICATION, $ouvertes));

        $this->assertSame([], $neuves, "Routes api/* sans auth:sanctum : les placer sous auth:sanctum, ou les inscrire dans SANS_AUTHENTIFICATION avec leur raison :\n".implode("\n", $neuves));
        $this->assertSame([], $mortes, "Entrées de SANS_AUTHENTIFICATION qui ne désignent plus une route ouverte : les retirer.\n".implode("\n", $mortes));
    }

    /** @return list<Route> */
    private function routes(): array
    {
        return array_values(app(Router::class)->getRoutes()->getRoutes());
    }

    private function cle(Route $route): string
    {
        return implode('|', array_values(array_diff($route->methods(), ['HEAD']))).' '.$route->uri();
    }

    /**
     * Les guards de chaque middleware d'authentification de la pile RÉSOLUE de la route : une liste
     * par middleware, vide pour `auth` sans paramètre (le guard par défaut).
     *
     * @return list<list<string>>
     */
    private function guardsDAuthentification(Route $route): array
    {
        $trouves = [];
        foreach (app(Router::class)->gatherRouteMiddleware($route) as $middleware) {
            if (! is_string($middleware)) {
                continue;
            }
            [$classe, $parametres] = array_pad(explode(':', $middleware, 2), 2, '');
            if (! class_exists($classe) || ! (is_a($classe, Authenticate::class, true) || is_a($classe, AuthenticateWithBasicAuth::class, true))) {
                continue;
            }
            $guards = $parametres === '' ? [] : array_map('trim', explode(',', $parametres));
            if (is_a($classe, AuthenticateWithBasicAuth::class, true)) {
                // auth.basic:{guard},{champ} : le premier paramètre est le guard, et le basic n'est jamais sanctum.
                $guards = ['basic:'.($guards[0] ?? 'défaut')];
            }
            $trouves[] = $guards;
        }

        return $trouves;
    }

    private function codeSansCommentaires(string $source): string
    {
        $code = '';
        foreach (token_get_all($source) as $jeton) {
            if (is_array($jeton) && in_array($jeton[0], [T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }
            $code .= is_array($jeton) ? $jeton[1] : $jeton;
        }

        return $code;
    }
}
