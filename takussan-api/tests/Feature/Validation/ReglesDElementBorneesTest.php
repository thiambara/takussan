<?php

namespace Tests\Feature\Validation;

use App\Http\Requests\Agency\StoreAgentHandoverRequest;
use App\Http\Requests\Agency\SyncCapabilitiesRequest;
use App\Http\Requests\Api\Admin\StoreAlertRuleRequest;
use App\Http\Requests\Api\Admin\StoreAnnouncementRequest;
use App\Http\Requests\Api\Admin\UpdateAlertRuleRequest;
use App\Http\Requests\Api\Admin\UpdateAnnouncementRequest;
use App\Http\Requests\Api\Admin\UpdateFeatureFlagRequest;
use App\Http\Requests\Api\Admin\UpdateRadarCrawlSourceRequest;
use App\Http\Requests\Api\IndexCalendarRequest;
use App\Http\Requests\Api\Me\UpdateAvailabilityServiceProviderProfileRequest;
use App\Http\Requests\Api\Me\UpdateSpecializationAgentProfileRequest;
use App\Http\Requests\Api\Me\UpdateTradesServiceProviderProfileRequest;
use App\Http\Requests\Api\ReorderPropertyMediaRequest;
use App\Http\Requests\Api\StorePropertyCollaboratorRequest;
use App\Http\Requests\Api\SyncPropertyTagRequest;
use App\Http\Requests\Api\UpdateKpiConfigRequest;
use App\Http\Requests\AttachCustomerTagsRequest;
use App\Http\Requests\Invitation\InviteServiceProviderRequest;
use App\Http\Requests\Public\BookingRequestPublicPropertyRequest;
use App\Http\Requests\Public\ContactClickPublicRequest;
use App\Http\Requests\Public\IndexPublicProfilesRequest;
use App\Http\Requests\Public\VisitRequestPublicPropertyRequest;
use App\Http\Requests\Public\VisitSlotsPublicPropertyRequest;
use App\Http\Requests\RefundDepositRequest;
use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Validator;
use Laravel\Sanctum\Sanctum;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use ReflectionMethod;
use Tests\TestCase;
use Throwable;

/**
 * TCK-2488 — une liste qui dépasse sa borne rend le 422 de son parent, SEUL : ses éléments ne sont pas
 * validés un à un (revue de TCK-2483, M1 : 20 000 éléments, 29 s de CPU, 2 Mo de 422). Le mécanisme
 * est `Concerns\BorneLesReglesDElement` (porté par `BaseFormRequest`, et par chaque FormRequest
 * directe qui en a besoin) sur `App\Support\ReglesDElementBornees`.
 *
 * Deux parties :
 *  1. un échantillon par HTTP — requête de base et requête directe, liste de scalaires, liste
 *     d'objets (`x.*.y`), `.*` imbriqué ;
 *  2. le RECENSEMENT de toutes les FormRequest concrètes : chaque clé `.*` dont les parents sont tous
 *     bornés doit tomber, PAR LA REQUÊTE ELLE-MÊME, sur un corps hors borne — et ce corps doit faire
 *     échouer le parent dans Laravel, sans quoi retirer la règle laisserait passer des éléments.
 *     Les clés à parent non borné sont figées dans `NON_BORNES` (liste expirante).
 *
 * ⚠ Ce que le recensement ne voit pas : une règle `.*` qui n'apparaît qu'avec une route ou un compte
 * (il joue `rules()` sans l'une ni l'autre), et les validateurs ad hoc hors FormRequest
 * (`JugeLaLigneDeReglageDAgence`, `PlatformSettingService`).
 */
class ReglesDElementBorneesTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Les clés `.*` dont un parent n'a pas de borne, relevées le 2026-11-06 (TCK-2488, Hors périmètre).
     * Aucune borne métier n'est inventée ici : chacune se borne en suite, et sort alors de la liste.
     *
     * @var array<class-string<FormRequest>, list<string>>
     */
    private const NON_BORNES = [
        StoreAgentHandoverRequest::class => ['successors.*'],
        SyncCapabilitiesRequest::class => ['capabilities.*'],
        StoreAlertRuleRequest::class => ['channels.*', 'recipients.emails.*', 'recipients.webhooks.*'],
        StoreAnnouncementRequest::class => ['segment.agency_ids.*', 'segment.roles.*'],
        UpdateAlertRuleRequest::class => ['channels.*', 'recipients.emails.*', 'recipients.webhooks.*'],
        UpdateAnnouncementRequest::class => ['segment.agency_ids.*', 'segment.roles.*'],
        UpdateFeatureFlagRequest::class => ['segments.agency_ids.*', 'segments.roles.*'],
        UpdateRadarCrawlSourceRequest::class => ['start_urls.*'],
        IndexCalendarRequest::class => ['property_ids.*', 'types.*'],
        UpdateAvailabilityServiceProviderProfileRequest::class => ['available_slots.*.day', 'available_slots.*.from', 'available_slots.*.to'],
        UpdateSpecializationAgentProfileRequest::class => ['intervention_zones.*'],
        UpdateTradesServiceProviderProfileRequest::class => ['intervention_zones.*', 'trades.*'],
        ReorderPropertyMediaRequest::class => ['order.*'],
        SyncPropertyTagRequest::class => ['tag_ids.*'],
        AttachCustomerTagsRequest::class => ['tags.*'],
        InviteServiceProviderRequest::class => ['intervention_zones.*', 'trades.*'],
        RefundDepositRequest::class => ['attachments.*'],
    ];

    /**
     * Les requêtes dont `rules()` ne se joue pas sans route ni compte. Leur source (et celle de leurs
     * traits) ne porte aucune clé `.*` : le jour où elle en porte une, elle se recense à la main.
     *
     * @var array<class-string<FormRequest>, string>
     */
    private const SANS_CONTEXTE = [
        StorePropertyCollaboratorRequest::class => 'le bien de la route',
        UpdateKpiConfigRequest::class => 'l\'agence du compte',
        BookingRequestPublicPropertyRequest::class => 'le bien publié de la route',
        ContactClickPublicRequest::class => 'le bien publié de la route',
        IndexPublicProfilesRequest::class => 'le nom de la route',
        VisitRequestPublicPropertyRequest::class => 'le bien publié de la route',
        VisitSlotsPublicPropertyRequest::class => 'le bien publié de la route',
    ];

    // ── 1. Échantillon par HTTP ───────────────────────────────────────────────────────────────

    public function test_requete_de_base_liste_d_objets_hors_borne_rend_le_seul_422_du_parent(): void
    {
        $owner = User::factory()->create();
        $bien = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => null]);
        Sanctum::actingAs($owner);

        $quatreInvalides = array_fill(0, 4, ['phone' => 'pas un numéro', 'has_whatsapp' => 'peut-être']);
        $reponse = $this->putJson("/api/properties/{$bien->id}/contacts", ['contacts' => $quatreInvalides])
            ->assertUnprocessable();
        $this->assertSame(['contacts'], array_keys($reponse->json('errors')));

        $troisDontUnInvalide = [['phone' => '+221770000701'], ['phone' => '+221770000702'], ['phone' => 'pas un numéro']];
        $reponse = $this->putJson("/api/properties/{$bien->id}/contacts", ['contacts' => $troisDontUnInvalide])
            ->assertUnprocessable();
        $this->assertSame(['contacts.2.phone'], array_keys($reponse->json('errors')), 'dans sa borne, la liste juge encore ses éléments');
    }

    public function test_requete_directe_liste_de_scalaires_hors_borne_rend_le_seul_422_du_parent(): void
    {
        $agence = Agency::factory()->create();
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agence);
        Sanctum::actingAs($agent);

        // 2000 éléments invalides et identiques : avant TCK-2488, 2000 erreurs `integer` et `distinct`.
        $reponse = $this->postJson('/api/properties/bulk-archive', ['property_ids' => array_fill(0, 2000, 'x')])
            ->assertUnprocessable();
        $this->assertSame(['property_ids'], array_keys($reponse->json('errors')));

        $reponse = $this->postJson('/api/properties/bulk-archive', ['property_ids' => [1, 'x']])
            ->assertUnprocessable();
        $this->assertSame(['property_ids.1'], array_keys($reponse->json('errors')), 'dans sa borne, la liste juge encore ses éléments');
    }

    public function test_requete_directe_generique_imbrique_hors_borne_rend_le_seul_422_du_parent(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $invalides = static fn (int $n): array => array_fill(0, $n, 'PAS UN IDENTIFIANT !');

        // Une instance de `personas.*.replies` au-delà de 20.
        $reponse = $this->patchJson('/api/me', ['navigation' => ['v' => 1, 'personas' => ['agent' => ['replies' => $invalides(21)]]]])
            ->assertUnprocessable();
        $this->assertSame(['navigation.personas.agent.replies'], array_keys($reponse->json('errors')));

        // `personas` est un `array:` à clés listées : une persona inconnue le refuse d'office.
        $reponse = $this->patchJson('/api/me', ['navigation' => ['v' => 1, 'personas' => [
            'inconnue' => ['epingles' => $invalides(3), 'cle_en_trop' => true],
        ]]])->assertUnprocessable();
        $this->assertSame(['navigation.personas'], array_keys($reponse->json('errors')));

        $reponse = $this->patchJson('/api/me', ['navigation' => ['v' => 1, 'personas' => ['agent' => ['replies' => ['g1', 'PAS UN IDENTIFIANT !']]]]])
            ->assertUnprocessable();
        $this->assertSame(['navigation.personas.agent.replies.1'], array_keys($reponse->json('errors')), 'dans sa borne, la liste juge encore ses éléments');
    }

    // ── 2. Recensement ────────────────────────────────────────────────────────────────────────

    public function test_toute_cle_d_element_bornee_tombe_par_la_requete_elle_meme_sur_un_corps_hors_borne(): void
    {
        ['bornees' => $bornees] = $this->recenser();
        $this->assertGreaterThan(60, count($bornees), 'recensement presque vide : la sonde ne lit plus les règles');

        $fautes = [];
        foreach ($bornees as [$classe, $cle, $parents]) {
            foreach ($parents as $parent => $regleDuParent) {
                $corps = self::corpsHorsBorne($parent, $regleDuParent);

                // Le parent échoue dans Laravel sur ce corps : retirer la règle d'élément est sans risque.
                if (! Validator::make($corps, [$parent => $regleDuParent])->fails()) {
                    $fautes[] = "{$classe} : « {$parent} » accepte le corps hors borne — le mécanisme laisserait passer « {$cle} »";
                }
                if (array_key_exists($cle, $this->reglesJouees($classe, $corps))) {
                    $fautes[] = "{$classe} : « {$cle} » est encore jugée quand « {$parent} » dépasse sa borne (BorneLesReglesDElement absent ?)";
                }
            }
            if (! array_key_exists($cle, $this->reglesJouees($classe, []))) {
                $fautes[] = "{$classe} : « {$cle} » a disparu sur un corps vide — le mécanisme retire trop";
            }
        }

        $this->assertSame([], $fautes, implode("\n", $fautes));
    }

    public function test_une_cle_d_element_sans_borne_neuve_rougit_et_la_liste_figee_expire(): void
    {
        ['nonBornees' => $nonBornees] = $this->recenser();

        $neuves = [];
        $perimees = [];
        foreach ($nonBornees as $classe => $cles) {
            foreach (array_diff($cles, self::NON_BORNES[$classe] ?? []) as $cle) {
                $neuves[] = "{$classe} : {$cle}";
            }
        }
        foreach (self::NON_BORNES as $classe => $cles) {
            foreach (array_diff($cles, $nonBornees[$classe] ?? []) as $cle) {
                $perimees[] = "{$classe} : {$cle}";
            }
        }

        $this->assertSame([], $neuves, "Ces règles d'élément valident chaque élément d'une liste sans borne : borner le parent (`array`, `max:N`) — TCK-2488.\n- ".implode("\n- ", $neuves));
        $this->assertSame([], $perimees, "Ces entrées de NON_BORNES n'ont plus la forme (bornées ou disparues) : les retirer.\n- ".implode("\n- ", $perimees));
    }

    public function test_une_requete_qui_ne_se_joue_pas_hors_contexte_est_nommee_et_ne_porte_aucune_cle_d_element(): void
    {
        ['sansContexte' => $sansContexte] = $this->recenser();

        $this->assertEqualsCanonicalizing(array_keys(self::SANS_CONTEXTE), $sansContexte, 'SANS_CONTEXTE ne correspond plus aux requêtes dont rules() lève hors contexte : la mettre à jour.');

        foreach (array_keys(self::SANS_CONTEXTE) as $classe) {
            $fichiers = [(string) (new ReflectionClass($classe))->getFileName()];
            foreach (class_uses_recursive($classe) as $trait) {
                $fichiers[] = (string) (new ReflectionClass($trait))->getFileName();
            }
            foreach ($fichiers as $fichier) {
                $this->assertDoesNotMatchRegularExpression("/['\"][\\w.{}\$]*\\.\\*/", (string) file_get_contents($fichier), "{$fichier} porte une clé `.*` que le recensement ne joue pas : la recenser à la main.");
            }
        }
    }

    // ── Outils ────────────────────────────────────────────────────────────────────────────────

    /** @var array{bornees: list<array{class-string<FormRequest>, string, array<string, mixed>}>, nonBornees: array<string, list<string>>, sansContexte: list<string>}|null */
    private ?array $recensement = null;

    /**
     * @return array{bornees: list<array{class-string<FormRequest>, string, array<string, mixed>}>, nonBornees: array<string, list<string>>, sansContexte: list<string>}
     */
    private function recenser(): array
    {
        if ($this->recensement !== null) {
            return $this->recensement;
        }

        $bornees = [];
        $nonBornees = [];
        $sansContexte = [];
        $classes = self::formRequests();
        $this->assertGreaterThan(300, count($classes), 'balayage de app/Http/Requests presque vide');

        foreach ($classes as $classe) {
            try {
                $regles = $this->reglesJouees($classe, [], brutes: true);
            } catch (Throwable) {
                $sansContexte[] = $classe;

                continue;
            }

            foreach (array_keys($regles) as $cle) {
                $cle = (string) $cle;
                $parents = [];
                $borne = true;
                foreach (self::prefixes($cle) as $parent) {
                    if (! array_key_exists($parent, $regles) || ! self::estBorne($regles[$parent])) {
                        $borne = false;

                        break;
                    }
                    $parents[$parent] = $regles[$parent];
                }
                if ($parents === [] && $borne) {
                    continue; // pas une clé d'élément
                }
                if ($borne) {
                    $bornees[] = [$classe, $cle, $parents];
                } else {
                    $nonBornees[$classe][] = $cle;
                }
            }
        }
        foreach ($nonBornees as &$cles) {
            sort($cles);
        }

        return $this->recensement = ['bornees' => $bornees, 'nonBornees' => $nonBornees, 'sansContexte' => $sansContexte];
    }

    /** @return list<class-string<FormRequest>> */
    private static function formRequests(): array
    {
        $racine = app_path('Http/Requests');
        $classes = [];
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine, RecursiveDirectoryIterator::SKIP_DOTS)) as $fichier) {
            if ($fichier->getExtension() !== 'php') {
                continue;
            }
            $relatif = substr($fichier->getPathname(), strlen($racine) + 1, -4);
            $classe = 'App\\Http\\Requests\\'.str_replace('/', '\\', $relatif);
            if (! class_exists($classe)) {
                continue;
            }
            $reflexion = new ReflectionClass($classe);
            if (! $reflexion->isAbstract() && $reflexion->isSubclassOf(FormRequest::class)) {
                $classes[] = $classe;
            }
        }
        sort($classes);

        return $classes;
    }

    /**
     * Les règles que la requête donne à son validateur pour ce corps (`validationRules()`, là où le
     * mécanisme agit) ; `brutes` : celles de `rules()`.
     *
     * @param  class-string<FormRequest>  $classe
     * @param  array<string, mixed>  $corps
     * @return array<string, mixed>
     */
    private function reglesJouees(string $classe, array $corps, bool $brutes = false): array
    {
        $requete = $classe::create('/recensement', 'POST', $corps);
        $requete->setContainer($this->app);
        $requete->setRouteResolver(fn () => null);
        $requete->setUserResolver(fn () => null);

        if ($brutes) {
            return method_exists($requete, 'rules') ? $this->app->call([$requete, 'rules']) : [];
        }

        return (new ReflectionMethod($requete, 'validationRules'))->invoke($requete);
    }

    /** @return list<string> */
    private static function prefixes(string $cle): array
    {
        preg_match_all('/\.\*(?=\.|$)/', $cle, $m, PREG_OFFSET_CAPTURE);

        return array_map(static fn (array $occurrence): string => substr($cle, 0, $occurrence[1]), $m[0]);
    }

    /** @return list<string> */
    private static function regles(mixed $regle): array
    {
        $liste = is_string($regle) ? explode('|', $regle) : (is_array($regle) ? $regle : [$regle]);

        return array_values(array_filter($liste, 'is_string'));
    }

    /** Un parent qui refuse d'office une liste trop longue, à clé hors liste, ou interdite. */
    private static function estBorne(mixed $regle): bool
    {
        $regles = self::regles($regle);
        if (array_filter($regles, static fn (string $r): bool => str_starts_with($r, 'exclude')) !== []) {
            return false;
        }
        $tableau = array_filter($regles, static fn (string $r): bool => $r === 'array' || $r === 'list' || str_starts_with($r, 'array:')) !== [];
        $max = array_filter($regles, static fn (string $r): bool => str_starts_with($r, 'max:')) !== [];
        $cles = array_filter($regles, static fn (string $r): bool => str_starts_with($r, 'array:')) !== [];

        return ($tableau && $max) || $cles || in_array('prohibited', $regles, true);
    }

    /**
     * Un corps où l'instance 0 du parent dépasse sa borne.
     *
     * @return array<string, mixed>
     */
    private static function corpsHorsBorne(string $parent, mixed $regle): array
    {
        $regles = self::regles($regle);
        $max = array_map(static fn (string $r): int => (int) substr($r, 4), array_filter($regles, static fn (string $r): bool => str_starts_with($r, 'max:')));
        $valeur = array_filter($regles, static fn (string $r): bool => str_starts_with($r, 'array:')) !== []
            ? ['__hors_liste__' => 'x']
            : array_fill(0, $max === [] ? 1 : min($max) + 1, 'x');

        return Arr::undot([str_replace('*', '0', $parent) => $valeur]);
    }
}
