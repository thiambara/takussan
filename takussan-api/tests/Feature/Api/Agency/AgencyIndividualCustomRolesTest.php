<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Membership\AgencySystemRoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\ApiTestCase;

/**
 * TCK-454 — « pas de rôles personnalisés » sur une agence `individual`.
 *
 * Deux endpoints répondaient 201 et 200 là où `docs/features.md:293` les
 * refuse (mesuré le 2026-08-27) :
 *
 * ```
 * POST  /api/agencies/{a}/roles        (RoleController@store)
 * PATCH /api/profiles/{p}/agency-role  (Profile\AgencyRoleController@update)
 * ```
 *
 * ## Ce que ce fichier refuse d'être
 *
 * Une garde plate ferait rougir le cas `individual` et cocherait les deux
 * premiers critères — **en fermant du même geste le seul rôle légitime de ces
 * agences**. Une agence individuelle A un rôle : son rôle SYSTÈME, posé par
 * `AgencySystemRoleSeeder` et porté par son unique `agency_admin`. Ce que la
 * spec lui refuse, c'est la PERSONNALISATION.
 *
 * D'où trois témoins qui doivent rester verts, et non un :
 *
 *  1. agence `standard` → la création reste ouverte ;
 *  2. agence `standard` → l'assignation d'un rôle personnalisé reste ouverte ;
 *  3. agence **`individual`** → l'assignation d'un rôle **système** réussit.
 *
 * Sans le troisième, une panne se lit comme un correctif.
 */
class AgencyIndividualCustomRolesTest extends ApiTestCase
{
    use RefreshDatabase;

    /**
     * @return array{Agency, User}
     */
    private function agenceAvecAdmin(AgencyKind $kind): array
    {
        $agency = Agency::factory()->create(['kind' => $kind]);
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create([
            'user_id' => $admin->id,
            'agency_id' => $agency->id,
        ]);

        return [$agency, $admin];
    }

    /**
     * AC2 — l'inventaire des routes est DÉRIVÉ, pas écrit de mémoire.
     *
     * TCK-392 a dû éprouver deux routes menant à `AgencyMemberRoleController@update`
     * (`PUT /members/{u}/role` et `PATCH /members/{u}`) : la seconde n'avait
     * été trouvée qu'à la deuxième passe. Ce test interroge la table de routage
     * plutôt que la mémoire, et rougira le jour où un second chemin atteindra
     * l'une de ces deux méthodes sans que son cas soit couvert ici.
     */
    public function test_chacune_des_deux_methodes_gardees_n_a_qu_une_seule_route(): void
    {
        $parAction = [];
        foreach (Route::getRoutes() as $route) {
            $action = $route->getActionName();
            if (str_contains($action, 'Agency\RoleController@store')
                || str_contains($action, 'Profile\AgencyRoleController@update')) {
                $parAction[$action][] = implode('|', $route->methods()).' '.$route->uri();
            }
        }

        $this->assertSame(
            [
                'App\Http\Controllers\Api\Agency\RoleController@store' => [
                    'POST api/agencies/{agency}/roles',
                ],
                'App\Http\Controllers\Api\Profile\AgencyRoleController@update' => [
                    'PATCH api/profiles/{profile}/agency-role',
                ],
            ],
            $parAction,
            "Une route de plus atteint une méthode gardée : son cas `individual` n'est pas couvert.",
        );
    }

    /** AC1 — création d'un rôle personnalisé refusée sur une agence `individual`. */
    public function test_une_agence_individuelle_ne_peut_pas_creer_de_role_personnalise(): void
    {
        [$agency, $admin] = $this->agenceAvecAdmin(AgencyKind::Individual);
        $this->actingAsApi($admin);

        $this->apiPost("/api/agencies/{$agency->id}/roles", [
            'name' => 'Négociateur senior',
            'base_profile_type' => AgencyRoleBaseType::Agent->value,
        ])->assertStatus(403);

        // AC3 — un 403 qui écrit quand même n'est pas un refus.
        $this->assertDatabaseMissing('agency_roles', [
            'agency_id' => $agency->id,
            'name' => 'Négociateur senior',
        ]);
    }

    /** AC1, TÉMOIN 1 — la même requête reste acceptée sur une agence `standard`. */
    public function test_temoin_une_agence_standard_cree_toujours_un_role_personnalise(): void
    {
        [$agency, $admin] = $this->agenceAvecAdmin(AgencyKind::Standard);
        $this->actingAsApi($admin);

        $this->apiPost("/api/agencies/{$agency->id}/roles", [
            'name' => 'Négociateur senior',
            'base_profile_type' => AgencyRoleBaseType::Agent->value,
        ])->assertStatus(201);

        $this->assertDatabaseHas('agency_roles', [
            'agency_id' => $agency->id,
            'name' => 'Négociateur senior',
            'is_system' => false,
        ]);
    }

    /** AC2 — assignation d'un rôle PERSONNALISÉ refusée sur une agence `individual`. */
    public function test_une_agence_individuelle_ne_peut_pas_assigner_un_role_personnalise(): void
    {
        [$agency, $admin] = $this->agenceAvecAdmin(AgencyKind::Individual);

        $personnalise = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->create(['agency_id' => $agency->id, 'is_system' => false]);

        $profile = AgentProfile::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $agency->id,
        ]);
        $avant = $profile->agency_role_id;

        $this->actingAsApi($admin);

        $this->apiPatch("/api/profiles/{$profile->id}/agency-role", [
            'profile_type' => AgencyRoleBaseType::Agent->value,
            'agency_role_id' => $personnalise->id,
        ])->assertStatus(403);

        // AC3 — l'affectation n'a pas eu lieu.
        $this->assertSame($avant, $profile->fresh()->agency_role_id);
        $this->assertDatabaseMissing('agent_profiles', [
            'id' => $profile->id,
            'agency_role_id' => $personnalise->id,
        ]);
    }

    /** AC2, TÉMOIN 2 — la même assignation reste ouverte sur une agence `standard`. */
    public function test_temoin_une_agence_standard_assigne_toujours_un_role_personnalise(): void
    {
        [$agency, $admin] = $this->agenceAvecAdmin(AgencyKind::Standard);

        $personnalise = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->create(['agency_id' => $agency->id, 'is_system' => false]);

        $profile = AgentProfile::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $agency->id,
        ]);

        $this->actingAsApi($admin);

        $this->apiPatch("/api/profiles/{$profile->id}/agency-role", [
            'profile_type' => AgencyRoleBaseType::Agent->value,
            'agency_role_id' => $personnalise->id,
        ])->assertOk();

        $this->assertSame($personnalise->id, $profile->fresh()->agency_role_id);
    }

    /**
     * TÉMOIN 3 — LE témoin qui distingue une garde d'une panne.
     *
     * Sur la MÊME agence `individual` qui refuse le rôle personnalisé,
     * l'assignation d'un rôle **système** doit réussir : c'est le seul rôle
     * que ces agences ont, et une garde plate le fermerait sans que les deux
     * premiers critères ne bronchent.
     */
    public function test_temoin_une_agence_individuelle_assigne_toujours_un_role_systeme(): void
    {
        [$agency, $admin] = $this->agenceAvecAdmin(AgencyKind::Individual);

        // Le rôle système d'agent existe déjà : l'observateur d'agence l'a semé
        // à la création, et une contrainte d'unicité interdit d'en fabriquer un
        // second (`agency_roles_one_system_role_per_base_type`). On prend celui
        // que la production a — c'est le seul rôle dont dispose une agence
        // individuelle.
        $systeme = AgencyRole::query()
            ->where('agency_id', $agency->id)
            ->where('base_profile_type', AgencyRoleBaseType::Agent->value)
            ->where('is_system', true)
            ->firstOrFail();

        $profile = AgentProfile::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $agency->id,
        ]);

        // Le profil part d'un rôle PERSONNALISÉ, écrit directement en base — le
        // cas réel d'une agence qui a été `standard` puis ne l'est plus. Sans
        // ça, `HasAgencyRole` ayant déjà posé le rôle système à la création du
        // profil, l'assignation serait un no-op et ne prouverait rien.
        $ancien = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->create(['agency_id' => $agency->id, 'is_system' => false]);
        $profile->forceFill(['agency_role_id' => $ancien->id])->save();

        $this->actingAsApi($admin);

        $this->apiPatch("/api/profiles/{$profile->id}/agency-role", [
            'profile_type' => AgencyRoleBaseType::Agent->value,
            'agency_role_id' => $systeme->id,
        ])->assertOk();

        $this->assertSame($systeme->id, $profile->fresh()->agency_role_id);
    }

    /**
     * AC5 — « le refus est lisible côté front », dans les trois langues.
     *
     * Le front n'invente pas ce texte : `messageErreurApi` affiche la prose du
     * serveur telle quelle dès qu'aucun `code` ne l'accompagne
     * (`src/lib/api.ts`, branche `proseServeur`), et Laravel la localise sur
     * `Accept-Language`. Ce sont donc `lang/{fr,en,wo}/agencies.php` qui SONT
     * les trois dictionnaires du ticket.
     *
     * Le test compare au libellé rendu par `__()` et non à une chaîne écrite
     * ici : ce qu'il éprouve est que la clé EXISTE dans les trois catalogues —
     * une clé absente rendrait son propre nom, et l'assertion tomberait.
     */
    public function test_le_refus_porte_un_libelle_dans_les_trois_langues(): void
    {
        [$agency, $admin] = $this->agenceAvecAdmin(AgencyKind::Individual);
        $this->actingAsApi($admin);

        $rendus = [];

        foreach (['fr', 'en', 'wo'] as $locale) {
            $attendu = trans('agencies.errors.individual_no_custom_roles', [], $locale);
            $rendus[$locale] = $attendu;

            // Les deux mailles ne prennent PAS le même défaut, et il a fallu
            // deux ablations pour le voir :
            //  · catalogue `wo` supprimé → Laravel retombe sur `fallback_locale`
            //    et rend le texte FRANÇAIS → attrapé par l'unicité, plus bas ;
            //  · catalogue `en` supprimé → le repli EST `en`, donc Laravel rend
            //    la CLÉ NUE → trois valeurs distinctes, unicité verte, et c'est
            //    cette assertion-ci qui rougit.
            // *Une seule des deux laissait passer la moitié des cas.*
            $this->assertNotSame(
                'agencies.errors.individual_no_custom_roles',
                $attendu,
                "La clé manque au catalogue `{$locale}` : Laravel rend son propre nom.",
            );

            // ⚠ `Accept-Language` ne suffit PAS : `SetLocaleMiddleware` fait
            // primer `preferred_language` de l'utilisateur authentifié sur la
            // négociation d'en-tête. Un test qui n'aurait posé que l'en-tête
            // aurait comparé trois fois le libellé français à lui-même et
            // serait resté vert sans rien éprouver.
            $admin->forceFill(['preferred_language' => $locale])->save();

            $this->apiPost("/api/agencies/{$agency->id}/roles", [
                'name' => "Rôle {$locale}",
                'base_profile_type' => AgencyRoleBaseType::Agent->value,
            ])
                ->assertStatus(403)
                ->assertJsonPath('message', $attendu);
        }

        // ⚠ CE bloc est la seule chose qui éprouve les TROIS catalogues, et il a
        // fallu une ablation pour s'en rendre compte : supprimer
        // `lang/wo/agencies.php` laissait la boucle ci-dessus VERTE. Laravel
        // retombe sur `fallback_locale` (fr), donc `trans(…, 'wo')` et la
        // réponse HTTP bougent ENSEMBLE — les deux côtés de l'assertion étaient
        // fournis par le même catalogue absent.
        //
        // *Un test qui compare une valeur à elle-même reste vert sans rien
        // garder.* Trois libellés distincts, en revanche, ne peuvent pas venir
        // d'un seul fichier.
        $this->assertCount(
            3,
            array_unique($rendus),
            'Un catalogue manque : deux langues rendent le même texte, donc au moins une retombe '
                .'sur le repli. '.json_encode($rendus, JSON_UNESCAPED_UNICODE),
        );
    }

    /**
     * La décision d'étape 0 posait que `AgencySystemRoleSeeder` n'entre ni par
     * `create()` ni par `assign()` — donc que la garde ne peut pas l'atteindre —
     * « **à vérifier par exécution avant de conclure** ». C'est ici que la
     * vérification est faite : le seeder est appelé sur une agence
     * `individual`, et il pose bien ses rôles système.
     *
     * Une lecture de code aurait dit la même chose ; elle ne l'aurait pas
     * prouvé.
     */
    public function test_le_seeder_de_roles_systeme_reste_operant_sur_une_agence_individuelle(): void
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);

        // L'observateur a déjà semé à la création ; on rejoue explicitement le
        // seeder pour éprouver le chemin que la garde ne doit pas croiser.
        app(AgencySystemRoleSeeder::class)->seed($agency);

        $systemes = AgencyRole::query()
            ->where('agency_id', $agency->id)
            ->where('is_system', true)
            ->get();

        $this->assertGreaterThan(0, $systemes->count());
        $this->assertTrue(
            $systemes->contains(fn (AgencyRole $r): bool => $r->base_profile_type === AgencyRoleBaseType::AgencyAdmin),
            "L'agence individuelle doit garder le rôle système de son unique agency_admin.",
        );
    }
}
