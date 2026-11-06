<?php

namespace Tests\Feature\Validation;

use App\Domain\Settings\EditablePlatformSettings;
use App\Http\Requests\Api\Admin\UpdateFeatureFlagRequest;
use App\Http\Requests\Api\Me\UpdateNotificationPreferencesRequest;
use App\Http\Requests\Api\ReorderPropertyMediaRequest;
use App\Http\Requests\Api\StorePropertyCollaboratorRequest;
use App\Http\Requests\Api\UpdateKpiConfigRequest;
use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Public\BookingRequestPublicPropertyRequest;
use App\Http\Requests\Public\ContactClickPublicRequest;
use App\Http\Requests\Public\IndexPublicProfilesRequest;
use App\Http\Requests\Public\VisitRequestPublicPropertyRequest;
use App\Http\Requests\Public\VisitSlotsPublicPropertyRequest;
use App\Models\Agency;
use App\Models\Enums\SettingScope;
use App\Models\Property;
use App\Models\User;
use App\Services\Notifications\PreferenceResolver;
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
 *  2. le RECENSEMENT de toutes les FormRequest concrètes : TOUTE clé `.*` a des parents bornés (revue
 *     de TCK-2488 : plus de liste de clés non bornées tolérées), chacune tombe, PAR LA REQUÊTE
 *     ELLE-MÊME, sur un corps hors borne — et ce corps fait échouer le parent dans Laravel, sans quoi
 *     retirer la règle laisserait passer des éléments.
 *
 * Le recensement joue `rules()` deux fois : sur un corps vide, et sur un corps DÉCLENCHEUR qui porte
 * (à `[]`) le premier parent de chaque clé `.*` écrite en littéral dans la source de la requête (sa
 * classe, ses parents, ses traits ; hors `messages()`/`attributes()`). Une clé littérale qu'aucun des
 * deux ne rend rougit : c'est ainsi que `preferences.*` d'`UpdateNotificationPreferencesRequest`,
 * posée seulement si le corps porte `preferences`, échappait au premier recensement (revue, I1).
 *
 * Un validateur ad hoc écrit dans un trait de requête (`JugeLaLigneDeReglageDAgence`) n'est pas joué
 * par `rules()` : il appelle lui-même `ReglesDElementBornees::retirer()`, et un test HTTP le garde.
 *
 * ⚠ Ce que le recensement ne voit pas : une clé `.*` CONSTRUITE (non littérale) posée sous une
 * condition que le corps déclencheur ne remplit pas, une règle qui n'apparaît qu'avec une route ou un
 * compte (il joue `rules()` sans l'une ni l'autre), et les validateurs ad hoc hors FormRequest
 * (`JugeLaLigneDeReglageDAgence`, `PlatformSettingService`).
 */
class ReglesDElementBorneesTest extends TestCase
{
    use RefreshDatabase;

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

    // ── 1 bis. Les parents bornés par la revue de TCK-2488, une famille chacun ────────────────
    //    (a) liste fermée → la borne vient de la liste ; (b) borne technique ≥ 10× le plus grand envoi
    //    du front ; (c) aucun appelant → 1000. Les bornes se LISENT dans la requête, jamais recopiées.

    public function test_liste_fermee_la_matrice_des_preferences_est_bornee_par_ses_evenements_et_ses_canaux(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $borne = count(PreferenceResolver::EVENTS) * count(PreferenceResolver::CHANNELS);
        $this->assertSame($borne, self::borneDe(UpdateNotificationPreferencesRequest::class, 'preferences', ['preferences' => []]));

        // Revue de TCK-2488 (I1) : 5000 éléments rendaient 15 000 erreurs, 1,26 Mo, 4,8 s — tout compte connecté.
        $invalides = array_fill(0, $borne + 1, ['event_type' => null, 'channel' => null, 'enabled' => 'peut-être']);
        $reponse = $this->patchJson('/api/me/notification-preferences', ['preferences' => $invalides])->assertUnprocessable();
        $this->assertSame(['preferences'], array_keys($reponse->json('errors')));

        // La matrice ENTIÈRE passe : la borne n'ôte rien à un envoi légitime.
        $matrice = [];
        foreach (PreferenceResolver::EVENTS as $evenement) {
            foreach (PreferenceResolver::CHANNELS as $canal) {
                $matrice[] = ['event_type' => $evenement, 'channel' => $canal, 'enabled' => true];
            }
        }
        $this->patchJson('/api/me/notification-preferences', ['preferences' => $matrice])->assertOk();
    }

    public function test_borne_technique_l_ordre_des_photos_hors_borne_rend_le_seul_422_du_parent(): void
    {
        $owner = User::factory()->create();
        $bien = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => null]);
        Sanctum::actingAs($owner);
        $borne = self::borneDe(ReorderPropertyMediaRequest::class, 'order');
        $this->assertGreaterThan(0, $borne, '`order` n\'a pas de borne');

        $reponse = $this->putJson("/api/properties/{$bien->id}/media/reorder", ['order' => array_fill(0, $borne + 1, 'x')])
            ->assertUnprocessable();
        $this->assertSame(['order'], array_keys($reponse->json('errors')));

        $reponse = $this->putJson("/api/properties/{$bien->id}/media/reorder", ['order' => [1, 'x']])->assertUnprocessable();
        $this->assertSame(['order.1'], array_keys($reponse->json('errors')), 'dans sa borne, la liste juge encore ses éléments');
    }

    public function test_sans_appelant_les_agences_d_un_drapeau_hors_borne_rendent_le_seul_422_du_parent(): void
    {
        $this->actingAsRole('super_admin');
        $borne = self::borneDe(UpdateFeatureFlagRequest::class, 'segments.agency_ids');
        $this->assertGreaterThan(0, $borne, '`segments.agency_ids` n\'a pas de borne');
        $drapeau = static fn (array $ids): array => ['enabled' => true, 'segments' => ['agency_ids' => $ids]];

        $reponse = $this->patchJson('/api/admin/feature-flags/host_auto_space', $drapeau(array_fill(0, $borne + 1, 'x')))
            ->assertUnprocessable();
        $this->assertSame(['segments.agency_ids'], array_keys($reponse->json('errors')));

        $reponse = $this->patchJson('/api/admin/feature-flags/host_auto_space', $drapeau([1, 'x']))->assertUnprocessable();
        $this->assertSame(['segments.agency_ids.1'], array_keys($reponse->json('errors')), 'dans sa borne, la liste juge encore ses éléments');
    }

    public function test_validateur_ad_hoc_la_ligne_de_reglage_d_agence_hors_borne_rend_la_seule_erreur_de_borne(): void
    {
        $agence = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agence);
        Sanctum::actingAs($admin);
        $regles = self::regles(EditablePlatformSettings::get('invoice.reminder_offsets_days')['rules']);
        $borne = min(array_map(static fn (string $r): int => (int) substr($r, 4), array_filter($regles, static fn (string $r): bool => str_starts_with($r, 'max:'))));

        $ligne = static fn (array $offsets): array => ['key' => 'invoice.reminder_offsets_days', 'value' => ['value' => $offsets], 'scope' => SettingScope::Agency->value];

        $reponse = $this->postJson('/api/settings', $ligne(array_fill(0, $borne + 1, 'x')))->assertUnprocessable();
        $this->assertSame(['value'], array_keys($reponse->json('errors')));
        $this->assertCount(1, $reponse->json('errors.value'), 'hors borne, seule l\'erreur de la liste est rendue');

        $reponse = $this->postJson('/api/settings', $ligne([3, 'x']))->assertUnprocessable();
        $this->assertCount(1, $reponse->json('errors.value'), 'dans sa borne, la liste juge encore ses éléments');
    }

    // ── 2. Recensement ────────────────────────────────────────────────────────────────────────

    public function test_toute_cle_d_element_bornee_tombe_par_la_requete_elle_meme_sur_un_corps_hors_borne(): void
    {
        ['bornees' => $bornees, 'declencheurs' => $declencheurs] = $this->recenser();
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
            if (! array_key_exists($cle, $this->reglesJouees($classe, $declencheurs[$classe] ?? []))) {
                $fautes[] = "{$classe} : « {$cle} » a disparu sur un corps dans sa borne — le mécanisme retire trop";
            }
        }

        $this->assertSame([], $fautes, implode("\n", $fautes));
    }

    public function test_toute_cle_d_element_a_des_parents_bornes(): void
    {
        ['nonBornees' => $nonBornees] = $this->recenser();

        $fautes = [];
        foreach ($nonBornees as $classe => $cles) {
            foreach ($cles as $cle) {
                $fautes[] = "{$classe} : {$cle}";
            }
        }

        $this->assertSame([], $fautes, "Ces règles d'élément valident chaque élément d'une liste sans borne : borner le parent (`array`, `max:N` — une liste fermée donne sa borne, sinon une borne technique 10× au-dessus du plus grand envoi légitime) — TCK-2488.\n- ".implode("\n- ", $fautes));
    }

    public function test_toute_cle_d_element_ecrite_dans_la_source_est_jouee_par_le_recensement(): void
    {
        ['inaperçues' => $inapercues] = $this->recenser();

        $this->assertSame([], $inapercues, "Ces clés `.*` sont écrites dans la source mais ni le corps vide ni le corps déclencheur ne les font rendre par rules() : leur condition échappe au recensement, le faire jouer.\n- ".implode("\n- ", $inapercues));
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

    /**
     * @var array{bornees: list<array{class-string<FormRequest>, string, array<string, mixed>}>, nonBornees: array<string, list<string>>, sansContexte: list<string>, declencheurs: array<string, array<string, mixed>>, inaperçues: list<string>}|null
     */
    private ?array $recensement = null;

    /**
     * @return array{bornees: list<array{class-string<FormRequest>, string, array<string, mixed>}>, nonBornees: array<string, list<string>>, sansContexte: list<string>, declencheurs: array<string, array<string, mixed>>, inaperçues: list<string>}
     */
    private function recenser(): array
    {
        if ($this->recensement !== null) {
            return $this->recensement;
        }

        $bornees = [];
        $nonBornees = [];
        $sansContexte = [];
        $declencheurs = [];
        $inapercues = [];
        $classes = self::formRequests();
        $this->assertGreaterThan(300, count($classes), 'balayage de app/Http/Requests presque vide');

        foreach ($classes as $classe) {
            try {
                $regles = $this->reglesJouees($classe, [], brutes: true);
            } catch (Throwable) {
                $sansContexte[] = $classe;

                continue;
            }

            // Le corps déclencheur : le premier parent de chaque clé `.*` littérale de la source, à `[]`
            // (dans toute borne). Les règles qu'il fait rendre s'AJOUTENT à celles du corps vide.
            $litterales = self::clesDElementDeLaSource($classe);
            $declencheur = self::corpsDeclencheur($litterales);
            if ($declencheur !== []) {
                try {
                    $regles += $this->reglesJouees($classe, $declencheur, brutes: true);
                    $declencheurs[$classe] = $declencheur;
                } catch (Throwable) {
                    // rules() ne se joue pas sur ce corps : ses clés conditionnelles restent inaperçues.
                }
            }
            foreach (array_diff($litterales, array_map('strval', array_keys($regles))) as $cle) {
                $inapercues[] = "{$classe} : {$cle}";
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

        return $this->recensement = [
            'bornees' => $bornees,
            'nonBornees' => $nonBornees,
            'sansContexte' => $sansContexte,
            'declencheurs' => $declencheurs,
            'inaperçues' => $inapercues,
        ];
    }

    /**
     * Les clés `.*` écrites en littéral (`'x.*…' =>`) dans la source de la requête, de ses parents
     * jusqu'à `BaseFormRequest`/`FormRequest` exclus, et de ses traits — sans `messages()` ni
     * `attributes()`, dont les clés (`x.*.regle`) ne sont pas des règles.
     *
     * @param  class-string<FormRequest>  $classe
     * @return list<string>
     */
    private static function clesDElementDeLaSource(string $classe): array
    {
        $porteurs = [];
        for ($r = new ReflectionClass($classe); $r !== false && ! in_array($r->getName(), [BaseFormRequest::class, FormRequest::class], true); $r = $r->getParentClass()) {
            $porteurs[] = $r;
        }
        foreach (class_uses_recursive($classe) as $trait) {
            $porteurs[] = new ReflectionClass($trait);
        }

        $cles = [];
        foreach ($porteurs as $porteur) {
            $fichier = (string) $porteur->getFileName();
            $lignes = file($fichier) ?: [];
            // Un validateur AD HOC (`Validator::make` dans un trait) ne passe pas par `rules()` : il
            // répond de ses clés en appelant lui-même la fonction (cf. le test du réglage d'agence).
            if (str_contains(implode('', $lignes), 'ReglesDElementBornees::retirer(')) {
                continue;
            }
            foreach (['messages', 'attributes'] as $methode) {
                if (! $porteur->hasMethod($methode)) {
                    continue;
                }
                $m = $porteur->getMethod($methode);
                if ($m->getFileName() !== $fichier || $m->getDeclaringClass()->getName() !== $porteur->getName()) {
                    continue;
                }
                for ($i = (int) $m->getStartLine() - 1; $i < (int) $m->getEndLine(); $i++) {
                    $lignes[$i] = '';
                }
            }
            preg_match_all('/[\'"]([A-Za-z0-9_]+(?:\.[A-Za-z0-9_*]+)*\.\*(?:\.[A-Za-z0-9_*]+)*)[\'"]\s*=>/', implode('', $lignes), $m);
            array_push($cles, ...$m[1]);
        }
        $cles = array_values(array_unique($cles));
        sort($cles);

        return $cles;
    }

    /**
     * @param  list<string>  $cles
     * @return array<string, mixed>
     */
    private static function corpsDeclencheur(array $cles): array
    {
        $parents = array_values(array_unique(array_map(static fn (string $cle): string => self::prefixes($cle)[0] ?? $cle, $cles)));
        // Le plus court d'abord : un parent plus profond s'écrit ensuite sans être écrasé.
        usort($parents, static fn (string $a, string $b): int => strlen($a) <=> strlen($b));

        $corps = [];
        foreach ($parents as $parent) {
            Arr::set($corps, $parent, []);
        }

        return $corps;
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

    /**
     * La borne `max:N` que la requête pose sur ce parent, lue dans ses règles (0 si aucune).
     *
     * @param  class-string<FormRequest>  $classe
     * @param  array<string, mixed>  $corps
     */
    private static function borneDe(string $classe, string $parent, array $corps = []): int
    {
        $requete = $classe::create('/borne', 'POST', $corps);
        $requete->setContainer(app());
        $requete->setRouteResolver(fn () => null);
        $requete->setUserResolver(fn () => null);
        $max = array_map(
            static fn (string $r): int => (int) substr($r, 4),
            array_filter(self::regles(app()->call([$requete, 'rules'])[$parent] ?? []), static fn (string $r): bool => str_starts_with($r, 'max:')),
        );

        return $max === [] ? 0 : min($max);
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
