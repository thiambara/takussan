<?php

namespace Tests\Unit\Services\Membership;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\AgencyRoleCapability;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Membership\AgencyRoleCapabilityCache;
use App\Services\Membership\AgencyRoleService;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use ReflectionMethod;
use Tests\TestCase;

/**
 * TCK-279 AC9 — le résolveur met en cache la matrice, et l'invalide à
 * l'édition du rôle, au sync des capacités, et à la réaffectation.
 *
 * Le cache est indexé par `agency_role_id` et non par profil : voir le
 * docblock d'{@see AgencyRoleCapabilityCache} pour la raison.
 */
class MembershipCapabilityResolverCacheTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private AgencyRole $role;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::PropertiesPublish])
            ->create(['agency_id' => $this->agency->id]);

        $this->agent = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
            'agency_role_id' => $this->role->id,
        ]);
    }

    private function cache(): AgencyRoleCapabilityCache
    {
        return app(AgencyRoleCapabilityCache::class);
    }

    /**
     * La preuve du cache est la DISPARITION de la requête sur le pivot au
     * second appel — pas la seule égalité des verdicts, qui serait vraie
     * sans cache du tout.
     */
    public function test_the_capability_matrix_is_read_from_cache_on_the_second_call(): void
    {
        $this->cache()->values((int) $this->role->id);

        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->cache()->values((int) $this->role->id);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();

        $onPivot = array_filter(
            $queries,
            static fn (array $q): bool => str_contains($q['query'], 'agency_role_capabilities'),
        );

        $this->assertCount(0, $onPivot, 'le second appel ne doit pas retoucher le pivot');
    }

    public function test_a_cold_call_does_hit_the_pivot(): void
    {
        $this->cache()->forget((int) $this->role->id);

        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->cache()->values((int) $this->role->id);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();

        $onPivot = array_filter(
            $queries,
            static fn (array $q): bool => str_contains($q['query'], 'agency_role_capabilities'),
        );

        $this->assertNotEmpty($onPivot, 'un appel à froid doit lire le pivot');
    }

    public function test_ac9_syncing_capabilities_invalidates_the_cache(): void
    {
        $resolver = app(MembershipCapabilityResolver::class);
        $this->assertTrue($resolver->allows($this->agent, Capability::PropertiesPublish, $this->agency));

        app(AgencyRoleService::class)->replaceCapabilities($this->role, [Capability::PropertiesCreate]);

        $this->assertFalse($resolver->allows($this->agent, Capability::PropertiesPublish, $this->agency));
        $this->assertTrue($resolver->allows($this->agent, Capability::PropertiesCreate, $this->agency));
    }

    public function test_ac9_saving_the_role_invalidates_the_cache(): void
    {
        $this->cache()->values((int) $this->role->id);

        // Écriture du pivot HORS service : sans le hook `saved` du modèle,
        // le cache resterait périmé.
        AgencyRoleCapability::query()->create([
            'agency_role_id' => $this->role->id,
            'capability' => Capability::BookingsValidate->value,
        ]);
        $this->role->touch();

        $this->assertTrue(
            app(MembershipCapabilityResolver::class)
                ->allows($this->agent, Capability::BookingsValidate, $this->agency),
        );
    }

    public function test_ac9_reassigning_a_profile_takes_effect_at_once(): void
    {
        $resolver = app(MembershipCapabilityResolver::class);
        $other = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::BookingsRefund])
            ->create(['agency_id' => $this->agency->id]);

        $this->assertFalse($resolver->allows($this->agent, Capability::BookingsRefund, $this->agency));

        $profile = AgentProfile::query()->where('user_id', $this->agent->id)->firstOrFail();
        app(AgencyRoleService::class)->assign($profile, $other);

        $this->assertTrue($resolver->allows($this->agent, Capability::BookingsRefund, $this->agency));
        $this->assertFalse($resolver->allows($this->agent, Capability::PropertiesPublish, $this->agency));
    }

    public function test_deleting_a_role_forgets_its_key(): void
    {
        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::PropertiesPublish])
            ->create(['agency_id' => $this->agency->id]);

        $this->assertTrue($this->cache()->allows((int) $role->id, Capability::PropertiesPublish));

        $id = (int) $role->id;
        $role->delete();

        $this->assertSame([], $this->cache()->values($id));
    }

    /**
     * Contrainte du ticket : la signature publique du résolveur ne bouge
     * pas — les sites d'appel `$user->canActAt(Capability, ?Agency)` créés
     * en P2/P3 doivent rester valides sans une seule retouche.
     */
    public function test_the_public_signature_of_the_resolver_is_unchanged(): void
    {
        $method = new ReflectionMethod(MembershipCapabilityResolver::class, 'allows');

        $this->assertTrue($method->isPublic());
        $this->assertSame('bool', (string) $method->getReturnType());

        $params = $method->getParameters();
        $this->assertCount(3, $params);
        $this->assertSame('user', $params[0]->getName());
        $this->assertSame(User::class, (string) $params[0]->getType());
        $this->assertSame('capability', $params[1]->getName());
        $this->assertSame(Capability::class, (string) $params[1]->getType());
        $this->assertSame('agency', $params[2]->getName());
        $this->assertSame('?'.Agency::class, (string) $params[2]->getType());
        $this->assertTrue($params[2]->isOptional());
    }
}
