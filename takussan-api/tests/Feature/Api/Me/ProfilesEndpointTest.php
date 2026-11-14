<?php

namespace Tests\Feature\Api\Me;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

class ProfilesEndpointTest extends TestCase
{
    use RefreshDatabase;
    use SessionsDImpersonation;

    public function test_get_me_profiles_lists_all_user_profiles(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();

        $owner = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        $agent = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/me/profiles')->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->sort()->values()->all();
        $expected = collect([
            "owner:{$owner->id}",
            "agent:{$agent->id}",
        ])->sort()->values()->all();

        $this->assertSame($expected, $ids);
        $this->assertSame(2, $response->json('meta.count'));
    }

    public function test_get_me_profiles_never_leaks_other_users_profiles(): void
    {
        $me = User::factory()->create();
        $someone_else = User::factory()->create();
        $agency = Agency::factory()->create();

        OwnerProfile::factory()->create(['user_id' => $me->id, 'agency_id' => $agency->id]);
        OwnerProfile::factory()->create(['user_id' => $someone_else->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($me);

        $response = $this->getJson('/api/me/profiles')->assertOk();

        $userIds = collect($response->json('data'))
            ->pluck('numeric_id')
            ->all();

        $this->assertCount(1, $userIds);
        $this->assertSame(1, $response->json('meta.count'));
    }

    /**
     * TCK-1317 (P117.04) — la section « Profil professionnel » affiche la licence et la spécialité
     * du profil d'agent, en lecture seule : la ressource les rend pour le seul profil d'agent.
     */
    public function test_agent_profile_carries_license_and_specialty_and_others_do_not(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        $agent = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'license_number' => 'AGC-2026-0042',
            'specialty' => 'Location meublée',
        ]);
        $owner = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($user);

        $data = collect($this->getJson('/api/me/profiles')->assertOk()->json('data'))->keyBy('id');

        $this->assertSame('AGC-2026-0042', $data["agent:{$agent->id}"]['license_number']);
        $this->assertSame('Location meublée', $data["agent:{$agent->id}"]['specialty']);
        $this->assertSame($agency->name, $data["agent:{$agent->id}"]['agency']['name']);
        $this->assertArrayNotHasKey('license_number', $data["owner:{$owner->id}"]);
        $this->assertArrayNotHasKey('specialty', $data["owner:{$owner->id}"]);
    }

    public function test_get_me_profiles_requires_authentication(): void
    {
        $this->getJson('/api/me/profiles')->assertStatus(401);
    }

    public function test_meta_active_profile_id_reflects_resolved_profile_for_single_profile_user(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        $profile = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($user);

        $this->getJson('/api/me/profiles')
            ->assertOk()
            ->assertJsonPath('meta.active_profile_id', "agent:{$profile->id}");
    }

    /**
     * TCK-2479 — l'ORDRE de l'auto-bascule (une agence, aucun signal) : le premier profil actif de
     * `HasProfiles::profiles()`, bailleur puis agent puis admin. Le menu de `/app` retient le même
     * type sans profil actif lisible (`takussan-web/src/lib/navigation/personas.ts`,
     * `TYPE_DOMINANT`) : si cet ordre change, le front doit changer avec lui.
     *
     * @return array<string, array{0: list<string>, 1: string}>
     */
    public static function combinaisons(): array
    {
        return [
            'admin + bailleur' => [['agency_admin', 'owner'], 'owner'],
            'admin + agent' => [['agency_admin', 'agent'], 'agent'],
            'agent + bailleur' => [['agent', 'owner'], 'owner'],
            'admin + agent + bailleur' => [['agency_admin', 'agent', 'owner'], 'owner'],
        ];
    }

    /** @param list<string> $types */
    #[DataProvider('combinaisons')]
    public function test_l_auto_bascule_retient_le_premier_type_dans_l_ordre_de_profiles(array $types, string $attendu): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        $ids = [];
        // Créés dans l'ordre INVERSE de l'attendu : l'ordre ne vient pas des identifiants.
        foreach (array_reverse($types) as $type) {
            $classe = ['agency_admin' => AgencyAdminProfile::class, 'agent' => AgentProfile::class, 'owner' => OwnerProfile::class][$type];
            $ids[$type] = $classe::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id])->id;
        }

        Sanctum::actingAs($user);

        $this->getJson('/api/me/profiles')
            ->assertOk()
            ->assertJsonPath('meta.active_profile_id', "{$attendu}:{$ids[$attendu]}");
    }

    public function test_index_filters_out_inactive_profiles(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();

        $active = OwnerProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $a->id,
            'status' => OwnerProfileStatus::Active,
        ]);
        OwnerProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $b->id,
            'status' => OwnerProfileStatus::Blocked,
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/me/profiles')->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertSame(["owner:{$active->id}"], $ids);
        $this->assertSame(1, $response->json('meta.count'));
    }

    public function test_resource_exposes_composite_id_type_and_agency(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create(['name' => 'Acme']);
        $profile = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($user);

        $this->getJson('/api/me/profiles')
            ->assertOk()
            ->assertJsonPath('data.0.id', "owner:{$profile->id}")
            ->assertJsonPath('data.0.type', 'owner')
            ->assertJsonPath('data.0.numeric_id', $profile->id)
            ->assertJsonPath('data.0.agency.id', $agency->id)
            ->assertJsonPath('data.0.agency.name', 'Acme');
    }

    /**
     * TCK-497 — deux profils d'une MÊME agence restent tous deux listés, et la
     * charge utile porte enfin de quoi les séparer.
     *
     * C'est la situation que l'assistant hôte fabrique à chaque passage :
     * `AgencyAdminProfile` + `OwnerProfile` dans une agence `individual`. Le
     * sélecteur affichait deux lignes rigoureusement identiques — même nom, même
     * slug, jusqu'au rang de collision `-3` — parce que rien dans la réponse ne
     * permettait de les distinguer autrement que par leur `type`.
     */
    public function test_deux_profils_dune_meme_agence_portent_la_nature_de_l_agence(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create([
            'name' => 'Espace de Awa Diop',
            'kind' => AgencyKind::Individual,
        ]);
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $reponse = $this->actingAs($user)->getJson('/api/me/profiles')->assertOk();

        // AC5 — le changement est de PRÉSENTATION : le contrat continue de
        // lister les deux profils, et chacun reste commutable.
        $this->assertCount(2, $reponse->json('data'));

        foreach ($reponse->json('data') as $profil) {
            $this->assertSame($agency->id, $profil['agency']['id']);
            $this->assertSame('individual', $profil['agency']['kind']);
        }
    }

    public function test_une_agence_standard_se_declare_comme_telle(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->actingAs($user)
            ->getJson('/api/me/profiles')
            ->assertOk()
            ->assertJsonPath('data.0.agency.kind', 'standard');
    }

    // ── TCK-2620 (ADR-0004, amendement du 2026-11-10) — le dernier espace retenu sur le compte ──

    private const MOT_DE_PASSE = 'motdepasse-2620';

    /** Une vraie connexion (`POST /api/auth/login`), sans cookie ni en-tête resté posé. */
    private function seConnecter(User $user): static
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $jeton = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => self::MOT_DE_PASSE,
        ])->assertOk()->json('token');
        $this->assertIsString($jeton);

        $this->flushHeaders();
        $this->app['auth']->forgetGuards();

        return $this->withToken($jeton);
    }

    private function seDeconnecter(): void
    {
        $this->postJson('/api/auth/logout')->assertOk();
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
    }

    /** @return array{0: User, 1: AgentProfile, 2: AgentProfile, 3: Agency, 4: Agency} */
    private function agentDeDeuxAgences(): array
    {
        $user = User::factory()->create(['password' => bcrypt(self::MOT_DE_PASSE)]);
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $chezA = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        $chezB = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);

        return [$user, $chezA, $chezB, $a, $b];
    }

    /** AC1 (et AC5 : l'ablation du niveau « dernier espace » de `ResolveActiveProfile` le rougit). */
    public function test_un_compte_de_deux_agences_retrouve_le_dernier_espace_choisi(): void
    {
        [$user, , $chezB, , $b] = $this->agentDeDeuxAgences();

        // Sans rien de retenu, deux agences : aucun profil lié (aucune auto-bascule).
        $this->seConnecter($user)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('agency_id', null)
            ->assertJsonPath('active_profile_id', null);

        $this->patchJson('/api/me/active-profile', ['profile_id' => "agent:{$chezB->id}"])->assertOk();
        $this->seDeconnecter();

        $this->seConnecter($user)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('agency_id', $b->id)
            ->assertJsonPath('active_profile_id', "agent:{$chezB->id}");
    }

    /** AC2. */
    public function test_remember_faux_efface_le_dernier_espace(): void
    {
        [$user, , $chezB] = $this->agentDeDeuxAgences();

        $this->seConnecter($user)->patchJson('/api/me/active-profile', ['profile_id' => "agent:{$chezB->id}"])->assertOk();
        $this->assertSame("agent:{$chezB->id}", $user->fresh()->metadata['last_active_profile'] ?? null);

        // « Pour cette fois » : le choix vaut pour la session (cookie), mais rien n'est retenu.
        $this->patchJson('/api/me/active-profile', ['profile_id' => "agent:{$chezB->id}", 'remember' => false])
            ->assertOk()
            ->assertCookie('active_profile_id', "agent:{$chezB->id}", false);
        $this->assertArrayNotHasKey('last_active_profile', (array) $user->fresh()->metadata);
        $this->seDeconnecter();

        $this->seConnecter($user)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('agency_id', null)
            ->assertJsonPath('active_profile_id', null);
    }

    /** `remember` est un booléen : une autre valeur est refusée, pas lue comme vraie. */
    public function test_remember_non_booleen_est_refuse(): void
    {
        [$user, , $chezB] = $this->agentDeDeuxAgences();

        $this->seConnecter($user)
            ->patchJson('/api/me/active-profile', ['profile_id' => "agent:{$chezB->id}", 'remember' => 'peut-être'])
            ->assertUnprocessable();
        $this->assertArrayNotHasKey('last_active_profile', (array) $user->fresh()->metadata);
    }

    /** AC3 — trois agences, pour que l'auto-bascule ne relie rien une fois B écartée. */
    /**
     * Trou hérité de TCK-2620 (relevé par la vérification adverse de TCK-2621) — le profil d'AUTRUI est refusé
     * (403) AVANT que l'espace retenu ne soit écrit ou effacé : sous `remember` vrai, il n'est pas retenu à la
     * place du mien ; sous `remember` faux, le mien n'est pas oublié. Le 403 seul ne le disait pas
     * (`SelectActiveProfileTest::test_patch_active_profile_returns_403_for_other_users_profile`).
     */
    public function test_le_profil_d_autrui_n_ecrit_ni_n_efface_l_espace_retenu(): void
    {
        [$user, , $chezB, $a] = $this->agentDeDeuxAgences();
        $sien = OwnerProfile::factory()->create(['user_id' => User::factory()->create()->id, 'agency_id' => $a->id]);

        $this->seConnecter($user)->patchJson('/api/me/active-profile', ['profile_id' => "agent:{$chezB->id}"])->assertOk();
        $this->assertSame("agent:{$chezB->id}", $user->fresh()->metadata['last_active_profile'] ?? null);

        foreach ([true, false] as $remember) {
            $this->patchJson('/api/me/active-profile', ['profile_id' => "owner:{$sien->id}", 'remember' => $remember])->assertForbidden();
            $this->assertSame(
                "agent:{$chezB->id}",
                $user->fresh()->metadata['last_active_profile'] ?? null,
                'remember='.var_export($remember, true).' : ni écrit ni effacé',
            );
        }
    }

    /**
     * Un espace retenu qui appartient à autrui (posé hors de la route) n'est jamais lié. Deux gardes : le
     * middleware le juge par `resolve()` (profil DU compte), et `User::activeProfile()` écarte de toute façon un
     * profil d'un autre compte. La réponse de `/api/auth/me` ne voit que la seconde : l'attribut de la requête
     * garde la première, que lisent directement les lecteurs de `request()->activeProfile()`.
     */
    public function test_un_espace_retenu_d_autrui_est_ignore(): void
    {
        [$user, , , $a] = $this->agentDeDeuxAgences();
        $sien = OwnerProfile::factory()->create(['user_id' => User::factory()->create()->id, 'agency_id' => $a->id]);
        $user->forceFill(['metadata' => ['last_active_profile' => "owner:{$sien->id}"]])->save();

        $this->seConnecter($user)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('agency_id', null)
            ->assertJsonPath('active_profile_id', null);
        $this->assertNull(request()->attributes->get('active_profile'), 'le middleware ne lie pas le profil d\'autrui');
    }

    public function test_un_profil_retenu_suspendu_est_ignore_sans_403(): void
    {
        [$user, , $chezB] = $this->agentDeDeuxAgences();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => Agency::factory()->create()->id]);

        $this->seConnecter($user)->patchJson('/api/me/active-profile', ['profile_id' => "agent:{$chezB->id}"])->assertOk();
        $this->seDeconnecter();

        $chezB->update(['status' => AgentProfileStatus::Suspended]);

        $this->seConnecter($user)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('agency_id', null)
            ->assertJsonPath('active_profile_id', null);
        $this->getJson('/api/me/profiles')->assertOk()->assertJsonPath('meta.active_profile_id', null);
    }

    public function test_le_cookie_et_l_indice_l_emportent_sur_le_dernier_espace(): void
    {
        [$user, $chezA, $chezB, $a] = $this->agentDeDeuxAgences();

        $this->seConnecter($user)->patchJson('/api/me/active-profile', ['profile_id' => "agent:{$chezB->id}"])->assertOk();

        $this->withCredentials()->withUnencryptedCookie('active_profile_id', "agent:{$chezA->id}")
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('agency_id', $a->id)
            ->assertJsonPath('active_profile_id', "agent:{$chezA->id}");

        $this->seConnecter($user)->withHeaders(['X-Active-Profile-Hint' => "agent:{$chezA->id}"])
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('agency_id', $a->id)
            ->assertJsonPath('active_profile_id', "agent:{$chezA->id}");
    }

    /** ADR-0004, amendement du 2026-11-10, point 4 : le cookie s'efface, la mémoire du compte reste. */
    public function test_la_deconnexion_garde_le_dernier_espace(): void
    {
        [$user, , $chezB] = $this->agentDeDeuxAgences();

        $this->seConnecter($user)->patchJson('/api/me/active-profile', ['profile_id' => "agent:{$chezB->id}"])->assertOk();

        $reponse = $this->postJson('/api/auth/logout')->assertOk();
        $cookie = collect($reponse->headers->getCookies())->firstWhere(fn ($c) => $c->getName() === 'active_profile_id');
        $this->assertNotNull($cookie);
        $this->assertLessThanOrEqual(time(), $cookie->getExpiresTime(), 'la déconnexion efface toujours le cookie (TCK-509)');

        $this->assertSame("agent:{$chezB->id}", $user->fresh()->metadata['last_active_profile'] ?? null);
    }

    /** ADR-0004, amendement du 2026-11-10 : le choix retenu l'emporte sur l'ordre de l'auto-bascule. */
    public function test_l_espace_retenu_l_emporte_sur_l_auto_bascule_dans_une_meme_agence(): void
    {
        $user = User::factory()->create(['password' => bcrypt(self::MOT_DE_PASSE)]);
        $agence = Agency::factory()->create();
        $bailleur = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);
        $agent = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);

        // L'auto-bascule prend le bailleur (TCK-2479).
        $this->seConnecter($user)->getJson('/api/auth/me')->assertJsonPath('active_profile_id', "owner:{$bailleur->id}");

        $this->patchJson('/api/me/active-profile', ['profile_id' => "agent:{$agent->id}"])->assertOk();
        $this->seDeconnecter();

        $this->seConnecter($user)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('agency_id', $agence->id)
            ->assertJsonPath('active_profile_id', "agent:{$agent->id}");
    }

    /** ADR-0004, amendement du 2026-11-10, point 7 (ADR-0055) : la consultation ne lit ni n'écrit l'espace retenu. */
    public function test_l_impersonation_ne_lit_pas_l_espace_retenu(): void
    {
        [$cible, $chezA, $chezB] = $this->agentDeDeuxAgences();
        $cible->forceFill(['metadata' => ['last_active_profile' => "agent:{$chezB->id}"]])->save();

        ['jeton' => $jeton] = $this->ouvrirUneSession(cible: $cible);

        $this->avecLeJeton($jeton)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('id', $cible->id)
            ->assertJsonPath('agency_id', null)
            ->assertJsonPath('active_profile_id', null);

        $this->avecLeJeton($jeton)->patchJson('/api/me/active-profile', ['profile_id' => "agent:{$chezA->id}"])
            ->assertForbidden();
        $this->assertSame("agent:{$chezB->id}", $cible->fresh()->metadata['last_active_profile'] ?? null);
    }

    /** AC4. */
    public function test_la_ville_de_l_agence_est_rendue(): void
    {
        [$user, $chezA, $chezB, $a] = $this->agentDeDeuxAgences();
        Address::factory()->create([
            'addressable_type' => Agency::class,
            'addressable_id' => $a->id,
            'city' => 'Thiès',
            'region' => 'Thiès',
        ]);

        $data = collect($this->actingAs($user)->getJson('/api/me/profiles')->assertOk()->json('data'))->keyBy('id');

        $this->assertSame('Thiès', $data["agent:{$chezA->id}"]['agency']['city']);
        $this->assertArrayHasKey('city', $data["agent:{$chezB->id}"]['agency']);
        $this->assertNull($data["agent:{$chezB->id}"]['agency']['city']);

        // La réponse du choix porte la même forme.
        $this->patchJson('/api/me/active-profile', ['profile_id' => "agent:{$chezA->id}"])
            ->assertOk()
            ->assertJsonPath('data.agency.city', 'Thiès');
    }

    /** La ville ne coûte aucune lecture par profil : le compte de requêtes ne suit pas le nombre d'agences. */
    public function test_le_compte_de_requetes_ne_suit_pas_le_nombre_d_agences(): void
    {
        $compter = function (int $agences): int {
            $user = User::factory()->create();
            for ($i = 0; $i < $agences; $i++) {
                $agence = Agency::factory()->create();
                Address::factory()->create(['addressable_type' => Agency::class, 'addressable_id' => $agence->id, 'city' => 'Thiès']);
                AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);
                OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);
            }
            $this->app['auth']->forgetGuards();
            Sanctum::actingAs($user->fresh());

            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/me/profiles')->assertOk()->assertJsonCount($agences * 2, 'data');
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $this->assertSame($compter(1), $compter(3));
    }

    /** `/api/auth/me` dit QUEL profil le middleware a lié : le front cesse de le deviner (TYPE_DOMINANT). */
    public function test_me_rend_le_profil_lie(): void
    {
        [$user, $chezA, $chezB] = $this->agentDeDeuxAgences();

        $this->seConnecter($user)->withHeaders(['X-Profile-Id' => "agent:{$chezB->id}"])
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('active_profile_id', "agent:{$chezB->id}");

        $seul = User::factory()->create(['password' => bcrypt(self::MOT_DE_PASSE)]);
        $bailleur = OwnerProfile::factory()->create(['user_id' => $seul->id, 'agency_id' => $chezA->agency_id]);
        $this->seConnecter($seul)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('active_profile_id', "owner:{$bailleur->id}");

        $sansProfil = User::factory()->create(['password' => bcrypt(self::MOT_DE_PASSE)]);
        $this->seConnecter($sansProfil)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('active_profile_id', null);
    }
}
