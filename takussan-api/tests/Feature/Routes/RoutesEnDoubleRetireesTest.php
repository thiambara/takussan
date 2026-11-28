<?php

namespace Tests\Feature\Routes;

use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Illuminate\Routing\Router;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Tests\TestCase;

/**
 * TCK-3015 (ADR-0140 § 4) — les routes retirées se gardent par UNE table, pas par un fichier de test par retrait.
 *
 * Chaque ligne de `RETIREES` est une requête (verbe, chemin concret) qu'AUCUNE route ne doit plus servir : le
 * routeur est interrogé comme pour une vraie requête, si bien qu'une route remise sous un autre nom, ou une voisine
 * paramétrée qui avalerait le chemin (`POST api/media/{media}` pour `api/media/upload`), rougit aussi. `RESTENT`
 * nomme les voisines que chaque retrait devait épargner.
 *
 * Absorbe `CreationDAgenceRetireeTest`, `SuppressionDAgenceRetireeTest`, `DashboardStatsRouteRemovedTest`,
 * `UnifiedPaymentRouteRemovedTest`, `Invitation\CreationGeneriqueRetireeTest`,
 * `Admin\Platform\OwnAccountImmediateDeletionRemovedTest`, `Media\MediaGenericUploadTest` et les assertions de
 * retrait d'`AccountBlockSingleRouteTest` et de `PayoutMethodBankStatementTest`.
 */
class RoutesEnDoubleRetireesTest extends TestCase
{
    /**
     * « VERBE chemin » => pourquoi la route est partie. Un `{paramètre}` vaut `1` à la requête.
     *
     * @var array<string, string>
     */
    private const RETIREES = [
        // TCK-780 (P13.08) — doublaient une route gardée, sur la même action, sans aucun appelant.
        'POST api/auth/verify-phone' => 'doublon de POST api/auth/phone/verify-otp',
        'POST api/auth/phone/resend' => 'doublon de POST api/auth/phone/send-otp',
        'GET api/notifications/preferences' => 'doublon de GET api/me/notification-preferences',
        'PUT api/notifications/preferences' => 'doublon de PUT api/me/notification-preferences',
        // TCK-2311 (P225.06) — faisait de tout compte connecté l'administrateur principal d'une agence `standard`,
        // crédits de bienvenue compris, hors de la console et de la demande de passage professionnel.
        'POST api/agencies' => 'une agence se crée par la console ou par l\'espace hôte',
        // TCK-1499 (ADR-0048, amendement du 2026-10-22) — une agence sort du cycle de vie par son statut.
        'DELETE api/agencies/{agency}' => 'une agence ne se supprime pas',
        // TCK-952 (P45.03) — sans écran appelant, et sa clé divergeait selon le profil.
        'GET api/dashboard/stats' => 'les chiffres viennent de dashboard/me|agency|owner|agent|tenant',
        // TCK-940 (P46.01-03) — écrivait un loyer `paid` hors de `payments.record` et de la suspension du bailleur,
        // une restitution de caution sans reversement, un règlement hors des gardes de `mark-paid`.
        'POST api/payments' => 'un paiement se crée par les voies imbriquées et se règle par mark-paid',
        // TCK-2190 (P208) — rattachait l'invité au brouillon d'une autre agence, cooptait un `super_admin` hors de
        // `SuperAdminCooptationService`, invitait depuis une agence `individual`.
        'POST api/invitations' => 'on invite par agencies/{agency}/…/invite ou admin/super-admins/invite',
        // TCK-600 (AC8) — l'effacement immédiat, sans step-up, sans délai de grâce ni contrôle d'obligations.
        'DELETE api/auth/account' => 'l\'effacement passe par AccountDeletionService',
        'DELETE api/users/{user}' => 'l\'effacement passe par AccountDeletionService',
        // TCK-600 (verif-600 m1, m2) — bloquer et réactiver n'ont plus qu'un chemin, la console.
        'POST api/users/{user}/block' => 'la console porte motif, activité, avis et garde « opérateur »',
        'POST api/users/{user}/activate' => 'la console porte motif, activité, avis et garde « opérateur »',
        // TCK-764 (P10.08) — 30 fichiers par minute dans le compte appelant, que rien ne lisait ni ne nettoyait.
        'POST api/media/upload' => 'l\'envoi passe par POST api/media',
        // TCK-2463 (AC2) — la signature CDN de TCK-105 : un média privé sort par `media.private.show`.
        'GET api/media/{media}/sign' => 'un média privé sort par PrivateMediaAccess',
        // TCK-1055, 1056, 1057 (P66) — la liste vit dans l'enum PHP (ADR-0007) ; ni la validation ni le rendu ne
        // lisaient ce que la console écrivait.
        'POST api/admin/enums/{key}/values' => 'une valeur s\'ajoute dans l\'enum PHP',
        'DELETE api/admin/enums/{key}/values/{value}' => 'aucune écriture de bien ne lisait le drapeau',
        'PATCH api/admin/enums/{key}/values/{value}' => 'les libellés viennent de lang/ et du front',
    ];

    /** Les routes que chaque retrait devait épargner : la route gardée d'un doublon, les voisines d'un chemin. */
    private const RESTENT = [
        'POST api/auth/phone/verify-otp',
        'POST api/auth/phone/send-otp',
        'GET api/me/notification-preferences',
        'PUT api/me/notification-preferences',
        'PATCH api/me/notification-preferences',
        'GET api/agencies',
        'GET api/agencies/{agency}',
        'PATCH api/agencies/{agency}',
        'GET api/agencies/{agency}/members',
        'POST api/admin/agencies',
        'DELETE api/agencies/{agency}/agents/{user}',
        'DELETE api/agencies/{agency}/members/{user}',
        'DELETE api/agencies/{agency}/absences/{delegation}',
        'DELETE api/agencies/{agency}/role-delegations/{delegation}',
        'DELETE api/agencies/{agency}/roles/{role}',
        'DELETE api/agencies/{agency}/upgrade-requests/{upgradeRequest}',
        'GET api/dashboard/me',
        'GET api/payments/history',
        'GET api/invitations',
        'GET api/invitations/{invitation}',
        'POST api/media',
    ];

    public function test_aucune_route_ne_sert_plus_une_requete_retiree(): void
    {
        $servies = [];
        foreach (array_keys(self::RETIREES) as $requete) {
            $route = $this->routeQuiSert($requete);
            if ($route !== null) {
                $servies[] = $requete.' → '.implode('|', $route->methods()).' '.$route->uri().' ('.($route->getName() ?? 'sans nom').')';
            }
        }

        $this->assertSame([], $servies, "Une requête retirée est de nouveau servie (TCK-3015) — retirer la route, ou la sortir de RETIREES en disant pourquoi :\n".implode("\n", $servies));
    }

    public function test_les_voisines_des_retraits_restent_enregistrees(): void
    {
        $enregistrees = collect(app(Router::class)->getRoutes()->getRoutes())
            ->flatMap(fn (Route $r) => array_map(fn (string $m) => $m.' '.$r->uri(), $r->methods()))
            ->all();

        $this->assertSame([], array_values(array_diff(self::RESTENT, $enregistrees)), 'Une voisine d\'un retrait a disparu avec lui.');
    }

    /**
     * Le témoin HTTP : une requête retirée dont le chemin porte encore un autre verbe rend 405 dans l'enveloppe
     * d'erreur, avant toute authentification (le routeur répond avant les middlewares de la route).
     */
    public function test_une_requete_retiree_rend_405_dans_l_enveloppe(): void
    {
        $this->postJson('/api/agencies', ['name' => 'Agence du dehors'])
            ->assertStatus(405)
            ->assertJsonPath('code', 'http.method_not_allowed');
    }

    /** La route que le routeur choisirait pour « VERBE chemin », ou null quand il répondrait 404 ou 405. */
    private function routeQuiSert(string $requete): ?Route
    {
        [$verbe, $chemin] = explode(' ', $requete, 2);
        $concret = '/'.preg_replace('/\{[^}]+\}/', '1', $chemin);

        try {
            return app(Router::class)->getRoutes()->match(Request::create($concret, $verbe));
        } catch (NotFoundHttpException|MethodNotAllowedHttpException) {
            return null;
        }
    }
}
