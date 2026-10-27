<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use Illuminate\Contracts\Routing\UrlRoutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Route as RouteFacade;
use ReflectionMethod;
use Spatie\QueryBuilder\Exceptions\InvalidFilterQuery;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;
use Throwable;

/**
 * P216.05 (TCK-2244, ADR-0075 § 3) — le parcours des routes `GET` de l'API : pour chacune, `sort[]`,
 * `include[]` et `filter[<nom>][]`, et aucune réponse 5xx. Il ne juge pas la réponse précise (200,
 * 400 et 422 passent) : seulement qu'une valeur en liste n'accuse jamais le serveur.
 *
 * Deux conditions l'empêchent d'être vert sans rien prouver (ADR-0075 § 3) :
 * - **le nom de filtre est un nom que la route lit** : ceux que spatie autorise, lus dans son refus
 *   d'un filtre inconnu (`InvalidFilterQuery::$allowedFilters`), et ceux que l'action lit à la main,
 *   relevés dans sa source (`filter.<nom>`, `$filters['<nom>']`) ;
 * - **la route est atteinte** : une réponse 401, 403 ou 404 ne dit rien de la lecture du paramètre.
 *   Le test compte les routes atteintes, refuse que ce compte baisse sous `ATTEINTES_MIN`, et nomme
 *   dans `HORS_PARCOURS` les paramètres d'URL qu'il ne sait pas fournir.
 *
 * L'appelant est un super-admin, admin d'une agence active : `Gate::before` lui ouvre les policies,
 * et le profil d'agence lui ouvre les routes que `ResolveActiveProfile` borne à une agence.
 */
class ValeursEnListeParcoursDesRoutesTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /**
     * Le plancher des routes atteintes (mesuré le 2026-10-24 : 244 parcourues, 238 atteintes, `api/health` mis à part). Il ne
     * se baisse pas sans dire laquelle sort et pourquoi.
     */
    private const ATTEINTES_MIN = 238;

    /**
     * Les routes dont le témoin, sans aucun paramètre, rend déjà 5xx dans la suite : leur réponse ne
     * dit rien de la lecture d'une liste.
     *
     * @var array<string, string>
     */
    private const TEMOIN_5XX = [
        'api/health' => '503 quand une sonde échoue, et c\'est son contrat (`HealthController.php:22`) : en test, une dépendance sondée manque',
    ];

    /**
     * Les routes que le parcours ne sait pas encore atteindre, chacune avec sa raison : un paramètre
     * d'URL sans liaison de modèle, ou lié à un modèle sans fabrique. Le test exige que la liste soit
     * exacte : une route neuve qui n'est pas parcourue s'y nomme, une route qui y entre en sort.
     *
     * @var array<string, string>
     */
    private const HORS_PARCOURS = [
        'api/admin/jobs/failed/{id}' => '{id} : sans liaison de modèle',
        'api/admin/kyc/{dossier}' => '{dossier} : KycDossier sans fabrique',
        'api/admin/ai/evaluations/{evaluation}' => '{evaluation} : sans liaison de modèle',
        'api/admin/enums/{key}' => '{key} : sans liaison de modèle',
        'api/admin/notification-templates/{event}/{channel}' => '{event} : sans liaison de modèle',
        'api/admin/webhook-logs/{webhookLog}' => '{webhookLog} : IntegrationWebhookLog sans fabrique',
        'api/admin/reports/{report}/export' => '{report} : sans liaison de modèle',
        'api/report-exports/{reportExport}/download' => '{reportExport} : sans liaison de modèle',
        'api/audit-log/{entity}/{id}' => '{entity} : sans liaison de modèle',
        'api/activity-log/{entity}/{id}' => '{entity} : sans liaison de modèle',
        'api/auth/verify-email/{id}/{hash}' => '{id} : sans liaison de modèle',
        'api/auth/oauth/{provider}/redirect' => '{provider} : sans liaison de modèle',
        'api/auth/oauth/{provider}/callback' => '{provider} : sans liaison de modèle',
        'api/calendar-feed/{token}.ics' => '{token} : sans liaison de modèle',
        'api/data-exports/{dataExport}/download' => '{dataExport} : DataExport sans fabrique',
        'api/documents/{document}/versions/{versionId}/download' => '{versionId} : sans liaison de modèle',
        'api/invitations/{token}/prefill' => '{token} : sans liaison de modèle',
        'api/share/{token}' => '{token} : sans liaison de modèle',
        'api/share/{token}/download' => '{token} : sans liaison de modèle',
        'api/enums/{key}' => '{key} : sans liaison de modèle',
        'api/export/{entity}' => '{entity} : sans liaison de modèle',
        'api/kyc/documents/{media}' => '{media} : Media sans fabrique',
        'api/me/payouts/{payout}' => '{payout} : sans liaison de modèle',
        'api/me/wizard-drafts/{key}' => '{key} : sans liaison de modèle',
        'api/media/{media}/sign' => '{media} : Media sans fabrique',
        'api/media/{media}/file' => '{media} : Media sans fabrique',
        'api/pay/{token}' => '{token} : sans liaison de modèle',
        'api/pay/{token}/receipt' => '{token} : sans liaison de modèle',
        'api/{paymentType}/{paymentId}/verify' => '{paymentType} : sans liaison de modèle',
        'api/{paymentType}/{paymentId}/providers' => '{paymentType} : sans liaison de modèle',
        'api/public/properties/{slug}' => '{slug} : sans liaison de modèle',
        'api/public/properties/{property}/documents/{document}/file' => '{property} : sans liaison de modèle',
        'api/public/properties/{slug}/contact' => '{slug} : sans liaison de modèle',
        'api/public/properties/{slug}/availability' => '{slug} : sans liaison de modèle',
        'api/public/properties/{slug}/status' => '{slug} : sans liaison de modèle',
        'api/public/properties/{slug}/similar' => '{slug} : sans liaison de modèle',
        'api/public/properties/{slug}/reviews' => '{slug} : sans liaison de modèle',
        'api/public/properties/{slug}/review-eligibility' => '{slug} : sans liaison de modèle',
        'api/public/properties/{slug}/visit-slots' => '{slug} : sans liaison de modèle',
        'api/public/properties/{slug}/conversation' => '{slug} : sans liaison de modèle',
        'api/public/agents/{slug}' => '{slug} : sans liaison de modèle',
        'api/public/agents/{slug}/properties' => '{slug} : sans liaison de modèle',
        'api/public/agencies/{slug}' => '{slug} : sans liaison de modèle',
        'api/public/agencies/{slug}/properties' => '{slug} : sans liaison de modèle',
        'api/service-provider-bills/{bill}' => '{bill} : sans liaison de modèle',
        'api/webhooks/sms/lafricamobile/status/{token}/{notification}' => '{token} : sans liaison de modèle',
        'api/webhooks/whatsapp/status/{token}' => '{token} : sans liaison de modèle',
    ];

    public function test_aucune_route_get_ne_rend_5xx_sur_une_valeur_en_liste(): void
    {
        Http::fake();
        Mail::fake();
        Notification::fake();
        Queue::fake();
        $this->withoutMiddleware(ThrottleRequests::class);

        $agency = Agency::factory()->create();
        $user = $this->apiActingAsRole('super_admin', ['agency' => $agency]);
        $this->materializeRoleProfile($user, 'agency_admin', $agency);
        $agency->update(['primary_admin_id' => $user->id]);

        $modeles = [];
        $echecs = [];
        $atteintes = 0;
        /** @var array<string, string> $horsParcours */
        $horsParcours = [];
        $parcourues = 0;

        foreach (RouteFacade::getRoutes()->getRoutes() as $route) {
            if (! in_array('GET', $route->methods(), true) || ! str_starts_with($route->uri(), 'api/')) {
                continue;
            }

            if (isset(self::TEMOIN_5XX[$route->uri()])) {
                continue;
            }
            $url = $this->url($route, $modeles, $horsParcours);
            if ($url === null) {
                continue;
            }
            $parcourues++;

            $requetes = ['sort[]=1', 'include[]=1'];
            foreach ($this->filtres($route, $url) as $nom) {
                $requetes[] = 'filter['.$nom.'][]=1';
            }

            $atteinte = false;
            foreach ($requetes as $requete) {
                [$statut, $cause] = $this->appeler($url.'?'.$requete);
                if ($statut >= 500) {
                    $echecs[] = $route->uri().'?'.$requete.' → '.$statut.' '.$cause;
                }
                $atteinte = $atteinte || ! in_array($statut, [401, 403, 404, 405], true);
            }
            $atteintes += $atteinte ? 1 : 0;
        }

        $this->assertSame([], $echecs, "Routes GET qui rendent 5xx sur une valeur en liste :\n".implode("\n", $echecs));
        ksort($horsParcours);
        $attendues = self::HORS_PARCOURS;
        ksort($attendues);
        $this->assertSame($attendues, $horsParcours, 'Les routes hors parcours ont changé : nommer la route neuve dans HORS_PARCOURS, avec sa raison, ou retirer celle qui est désormais parcourue.');
        $this->assertGreaterThanOrEqual(self::ATTEINTES_MIN, $atteintes, sprintf('%d routes GET parcourues, %d atteintes (401, 403, 404 ou 405 sur toutes leurs requêtes : non atteintes).', $parcourues, $atteintes));
    }

    /**
     * L'URL de la route, ses paramètres remplis par un modèle de sa fabrique ; `null` si l'un d'eux
     * n'a pas de modèle à fournir (la route est alors nommée dans `$horsParcours`).
     *
     * @param  array<string, string|null>  $modeles
     * @param  array<string, string>  $horsParcours
     */
    private function url(Route $route, array &$modeles, array &$horsParcours): ?string
    {
        $classes = [];
        foreach ($route->signatureParameters(['subClass' => UrlRoutable::class]) as $parametre) {
            $type = $parametre->getType();
            if ($type instanceof \ReflectionNamedType) {
                $classes[$parametre->getName()] = $type->getName();
            }
        }

        $url = '/'.$route->uri();
        foreach ($route->parameterNames() as $nom) {
            $classe = $classes[$nom] ?? null;
            if ($classe === null) {
                $horsParcours[$route->uri()] = '{'.$nom.'} : sans liaison de modèle';

                return null;
            }
            $modeles[$classe] ??= $this->creer($classe);
            if ($modeles[$classe] === null) {
                $horsParcours[$route->uri()] = '{'.$nom.'} : '.class_basename($classe).' sans fabrique';

                return null;
            }
            $url = preg_replace('/\{'.$nom.'\??\}/', $modeles[$classe], $url);
        }

        return $url;
    }

    private function creer(string $classe): ?string
    {
        if (! is_subclass_of($classe, Model::class) || ! method_exists($classe, 'factory')) {
            return null;
        }

        try {
            return DB::transaction(function () use ($classe): string {
                $modele = $classe::factory()->create();

                return (string) $modele->getRouteKey();
            });
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * Les filtres que la route lit : ceux que spatie autorise, et ceux que l'action lit à la main.
     *
     * @return list<string>
     */
    private function filtres(Route $route, string $url): array
    {
        $noms = [];

        [, , $exception] = $this->appeler($url.'?filter[__sonde__]=x', true);
        if ($exception instanceof InvalidFilterQuery) {
            $noms = $exception->allowedFilters->all();
        }

        $action = $route->getAction('uses');
        if (is_string($action) && str_contains($action, '@')) {
            [$controleur, $methode] = explode('@', $action);
            if (method_exists($controleur, $methode)) {
                $reflexion = new ReflectionMethod($controleur, $methode);
                $lignes = file((string) $reflexion->getFileName()) ?: [];
                $source = implode('', array_slice($lignes, $reflexion->getStartLine() - 1, $reflexion->getEndLine() - $reflexion->getStartLine() + 1));
                preg_match_all("/filter\.([a-z_]+)|\\\$filters?\[['\"]([a-z_]+)['\"]\]|'filter'[^;]*?\)\[['\"]([a-z_]+)['\"]\]/", $source, $trouves);
                $noms = array_merge($noms, array_filter(array_merge($trouves[1], $trouves[2], $trouves[3])));
            }
        }

        return array_values(array_unique(array_map('strval', $noms)));
    }

    /**
     * Une requête dans un point de sauvegarde : une erreur SQL n'abandonne pas la transaction du
     * test, et rien de ce que la route écrit ne reste pour la suivante.
     *
     * @return array{int, string, ?Throwable}
     */
    private function appeler(string $url, bool $sonde = false): array
    {
        DB::beginTransaction();
        try {
            $reponse = $this->getJson($url);
            // Une réponse en flux (un export) ne porte pas la propriété.
            $exception = $reponse->baseResponse->exception ?? null;
            $statut = $reponse->getStatusCode();
        } catch (Throwable $e) {
            $exception = $e;
            $statut = 500;
        } finally {
            DB::rollBack();
        }

        $cause = $exception === null ? '' : class_basename($exception).' « '.mb_substr($exception->getMessage(), 0, 160).' » '
            .str_replace(base_path().'/', '', $exception->getFile()).':'.$exception->getLine();

        return [$statut, $cause, $exception];
    }
}
