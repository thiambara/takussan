<?php

namespace Tests\Feature\Admin\Platform;

use App\Http\Middleware\EnforceImpersonationReadOnly;
use App\Models\DataExport;
use App\Models\Document;
use App\Models\User;
use App\Services\Auth\SessionTokenIssuer;
use App\Support\Security\ProtectedActions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\PersonalAccessToken;
use ReflectionClass;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0055 §3) — AC5c : sous un jeton d'impersonation, on LIT, et rien d'autre.
 */
class ImpersonationReadOnlyTest extends TestCase
{
    use RefreshDatabase;
    use SessionsDImpersonation;

    /** AC5c. */
    public function test_la_cible_se_lit_et_ne_s_ecrit_pas(): void
    {
        ['cible' => $cible, 'jeton' => $jeton] = $this->ouvrirUneSession();
        $preferences = $cible->preferences;

        $this->avecLeJeton($jeton)->getJson('/api/auth/me')->assertOk()->assertJsonPath('id', $cible->id);

        $this->avecLeJeton($jeton)->patchJson('/api/me', ['city' => 'Ziguinchor'])
            ->assertForbidden()
            ->assertJsonPath('code', 'impersonation.read_only');
        $this->assertSame($preferences, $cible->fresh()->preferences);

        $this->avecLeJeton($jeton)->postJson('/api/me/data-exports')
            ->assertForbidden()
            ->assertJsonPath('code', 'impersonation.read_only');
        $this->assertSame(0, DataExport::query()->count());
    }

    /** Toute méthode non sûre, sur toute famille de routes — pas une liste d'écritures connues. */
    public function test_toute_methode_non_sure_est_refusee(): void
    {
        ['jeton' => $jeton] = $this->ouvrirUneSession();

        foreach ([
            ['post', '/api/properties'],
            ['post', '/api/notifications/read-all'],
            ['post', '/api/auth/logout'],
            ['patch', '/api/me'],
            ['put', '/api/me/wizard-drafts/annonce'],
            ['delete', '/api/me/calendar-feed'],
            ['delete', '/api/auth/me/deletion-request'],
        ] as [$methode, $chemin]) {
            $this->avecLeJeton($jeton)->json($methode, $chemin)
                ->assertForbidden()
                ->assertJsonPath('code', 'impersonation.read_only');
        }
    }

    /**
     * verif-600 M1 — le QR de la graine TOTP en cours d'enrôlement : la cible le confirme, et la
     * graine que l'opérateur a lue devient son second facteur. Les liens de partage d'un document
     * portent un `token` qui ouvre le fichier sans session.
     */
    public function test_aucun_secret_de_la_cible_ne_se_lit(): void
    {
        $cible = User::factory()->create(['two_factor_enabled' => false]);
        $cible->forceFill(['two_factor_secret' => 'JBSWY3DPEHPK3PXP'])->save();
        $document = Document::factory()->create();
        ['jeton' => $jeton] = $this->ouvrirUneSession(cible: $cible);

        foreach (['/api/auth/two-factor/qr', "/api/documents/{$document->id}/share-links"] as $chemin) {
            $reponse = $this->avecLeJeton($jeton)->getJson($chemin);
            $reponse->assertForbidden()->assertJsonPath('code', 'impersonation.read_only');
            $this->assertStringNotContainsString('<svg', $reponse->getContent(), $chemin);
        }

        // Témoin : la même cible, avec SON jeton, lit bien son QR — le refus est celui de la session.
        $propre = $cible->createToken('mobile')->plainTextToken;
        $this->avecLeJeton($propre)->get('/api/auth/two-factor/qr')->assertOk();
    }

    /** Les lectures refusées de l'ADR : la console, les exports, les codes de secours. */
    public function test_les_lectures_nommees_par_l_adr_sont_refusees(): void
    {
        ['jeton' => $jeton] = $this->ouvrirUneSession();

        foreach ([
            '/api/admin/users',
            '/api/me/data-exports',
            '/api/export/customers',
            '/api/activity-logs/export',
            '/api/auth/two-factor/recovery-codes',
        ] as $chemin) {
            $this->avecLeJeton($jeton)->getJson($chemin)
                ->assertForbidden()
                ->assertJsonPath('code', 'impersonation.read_only');
        }
    }

    /**
     * Second chemin : le jeton d'impersonation ne porte JAMAIS de confirmation 2FA ni la capacité
     * `*`. Une action sous step-up resterait refusée par `RequireRecentTwoFactor` si ce middleware
     * disparaissait ; une garde qui lirait les capacités du jeton refuserait toute écriture.
     */
    public function test_le_jeton_n_a_ni_step_up_ni_capacite_generale(): void
    {
        ['jeton' => $jeton] = $this->ouvrirUneSession();
        $ligne = PersonalAccessToken::findToken($jeton);

        $this->assertNull(SessionTokenIssuer::stepUpValidUntil($ligne));
        $this->assertFalse($ligne->can('*'));
        $this->assertFalse($ligne->can('properties.create'));
        $this->assertTrue($ligne->can('impersonation:read'));
    }

    /**
     * Aucun geste d'une liste de `ProtectedActions` ne passe sous un jeton d'impersonation — QUELLE
     * QUE SOIT LA LISTE. Les listes sont lues par réflexion, pas nommées : une liste ajoutée
     * ailleurs (`PLATFORM_TWO_FACTOR` de TCK-597) entre ici sans qu'on y touche. Chaque route est
     * passée au middleware lui-même, hors routeur : un 404 de liaison ne masque rien.
     */
    public function test_aucun_geste_protege_ne_passe_sous_le_jeton(): void
    {
        ['jeton' => $jeton] = $this->ouvrirUneSession();

        $listes = array_filter(
            (new ReflectionClass(ProtectedActions::class))->getConstants(),
            fn ($valeur) => is_array($valeur) && array_is_list($valeur) && $valeur !== []
                && array_filter($valeur, fn ($a) => ! is_string($a) || ! str_contains($a, '@')) === [],
        );
        $proteges = array_merge(...array_values($listes));
        $this->assertArrayHasKey('STEP_UP', $listes);

        $passes = [];
        $vues = 0;
        foreach (Route::getRoutes()->getRoutes() as $route) {
            if (! in_array(ProtectedActions::normalize($route->getActionName()), $proteges, true)) {
                continue;
            }
            $this->assertContains('api', $route->gatherMiddleware(), "{$route->uri()} échappe au groupe `api`.");

            foreach (array_diff($route->methods(), ['HEAD']) as $methode) {
                $vues++;
                $uri = '/'.preg_replace('/\{[^}]+\}/', '1', $route->uri());
                $requete = Request::create($uri, $methode, server: ['HTTP_AUTHORIZATION' => "Bearer {$jeton}"]);
                $requete->setRouteResolver(fn () => $route);
                $this->app['auth']->forgetGuards();
                $this->app->instance('request', $requete);

                try {
                    app(EnforceImpersonationReadOnly::class)->handle($requete, fn () => response('passé'));
                    $passes[] = "{$methode} {$route->uri()}";
                } catch (HttpException $refus) {
                    $this->assertSame(403, $refus->getStatusCode(), "{$methode} {$route->uri()}");
                }
            }
        }

        // Plancher : un balayage qui ne retrouve aucune route passerait au vert sans rien vérifier.
        $this->assertGreaterThan(40, $vues);
        $this->assertSame([], $passes, 'Gestes protégés exécutables sous impersonation.');
    }

    /** Hors session, rien ne change : le même compte écrit avec son propre jeton. */
    public function test_le_jeton_ordinaire_de_la_cible_ecrit_toujours(): void
    {
        ['cible' => $cible] = $this->ouvrirUneSession();
        $propre = $cible->createToken('mobile')->plainTextToken;

        $this->avecLeJeton($propre)->patchJson('/api/me', ['city' => 'Ziguinchor'])->assertOk();
        $this->assertSame('Ziguinchor', $cible->fresh()->preferences['city'] ?? null);
    }
}
