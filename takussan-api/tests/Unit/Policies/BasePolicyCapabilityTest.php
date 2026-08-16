<?php

namespace Tests\Unit\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Policies\BasePolicy;
use App\Policies\LeasePolicy;
use App\Policies\MediaPolicy;
use App\Policies\PropertyPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use ReflectionClass;
use Tests\TestCase;

/**
 * TCK-297 — `BasePolicy` construisait ses abilities par concaténation :
 * `$user->can($this->resource().'.view')`. Trois chaînes sur les cinq ne
 * correspondaient à AUCUN cas de `Capability` (`properties.view`,
 * `leases.view|update|delete`, et `media.` tout entier, qui n'est même pas un
 * préfixe de l'enum).
 *
 * Une ability non définie **ne lève pas, elle refuse**. Ces trois-là
 * refusaient donc tout le monde sauf le super-admin — silencieusement, sans
 * trace, et sans qu'aucun test ne rougisse puisque aucun site d'appel ne les
 * atteignait.
 *
 * C'est le MÊME défaut que TCK-278 avait corrigé dans `MediaPolicy::viewRaw`
 * (`can('properties.update')`). Le correctif d'alors a traité le symptôme et
 * laissé le générateur : la concaténation elle-même. Ces tests gardent le
 * générateur.
 */
class BasePolicyCapabilityTest extends TestCase
{
    use RefreshDatabase;

    /**
     * DÉRIVÉE de `app/Policies/`, jamais recopiée. Une liste écrite à la main
     * serait juste aujourd'hui et fausse à la quatrième policy — c'est
     * exactement le défaut qui a rendu `INDEX.md` faux à 80 % (dette D-15) et
     * qui avait fait oublier `Message` dans la liste des modèles indexables
     * (dette D-44).
     *
     * @return array<class-string<BasePolicy>>
     */
    private function basePolicySubclasses(): array
    {
        $classes = [];

        foreach (glob(app_path('Policies/*.php')) ?: [] as $file) {
            $class = 'App\\Policies\\'.basename($file, '.php');

            if (! class_exists($class)) {
                continue;
            }

            $reflection = new ReflectionClass($class);

            if ($reflection->isAbstract() || ! $reflection->isSubclassOf(BasePolicy::class)) {
                continue;
            }

            $classes[] = $class;
        }

        $this->assertNotEmpty($classes, 'aucune sous-classe de BasePolicy trouvée — le scan est cassé');

        return $classes;
    }

    /**
     * L'invariant central : une policy ne peut plus NOMMER une capacité, elle
     * ne peut que la DÉSIGNER. Le typage `?Capability` rend la faute
     * inexprimable — ce test garde le typage lui-même contre un retour en
     * arrière vers `resource(): string`.
     */
    public function test_no_base_policy_declares_a_capability_outside_the_enum(): void
    {
        foreach ($this->basePolicySubclasses() as $class) {
            $reflection = new ReflectionClass($class);

            $this->assertFalse(
                $reflection->hasMethod('resource'),
                "{$class} redéclare resource(): string — c'est la concaténation "
                .'que TCK-297 a supprimée. Déclarer des Capability typées.',
            );

            $policy = new $class;

            foreach (['viewCapability', 'createCapability', 'updateCapability', 'deleteCapability'] as $accessor) {
                $method = $reflection->getMethod($accessor);
                $method->setAccessible(true);
                $capability = $method->invoke($policy);

                $this->assertTrue(
                    $capability === null || $capability instanceof Capability,
                    "{$class}::{$accessor}() doit rendre un Capability ou null.",
                );
            }
        }
    }

    /**
     * Les capacités réellement déclarées existent — vérification redondante
     * avec le typage, mais qui survivrait à un `Capability::tryFrom()` glissé
     * quelque part.
     */
    public function test_declared_capabilities_resolve_to_a_real_enum_case(): void
    {
        foreach ($this->basePolicySubclasses() as $class) {
            $reflection = new ReflectionClass($class);
            $policy = new $class;

            foreach (['viewCapability', 'createCapability', 'updateCapability', 'deleteCapability'] as $accessor) {
                $method = $reflection->getMethod($accessor);
                $method->setAccessible(true);
                $capability = $method->invoke($policy);

                if ($capability === null) {
                    continue;
                }

                $this->assertNotNull(
                    Capability::tryFrom($capability->value),
                    "{$class}::{$accessor}() rend « {$capability->value} », absent de Capability.",
                );
            }
        }
    }

    /**
     * Une ability sans capacité déclarée REFUSE. C'est exactement ce que le
     * code faisait déjà — par accident, via une Gate jamais définie. Ce test
     * fige le comportement pour que la correction soit prouvée sans effet de
     * bord : ce ticket rend l'intention lisible, il ne rouvre aucun accès.
     */
    public function test_an_ability_without_capability_denies_a_non_super_admin(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($user, 'agency_admin', $agency);

        $lease = Lease::factory()->create(['agency_id' => $agency->id]);

        $policy = new LeasePolicy;

        $this->assertFalse($policy->viewAny($user), 'leases n’a pas de capacité de lecture');
        $this->assertFalse($policy->view($user, $lease));
        $this->assertFalse($policy->update($user, $lease));
        $this->assertFalse($policy->delete($user, $lease));
    }

    /**
     * Et une ability AVEC capacité déclarée passe par le résolveur. C'est le
     * seul cas qui distingue vraiment l'avant de l'après : `leases.create`
     * existe, il fonctionnait, il doit continuer.
     */
    public function test_a_declared_capability_still_resolves_through_the_resolver(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);

        $this->assertSame(
            $admin->canActAt(Capability::LeasesCreate, $agency),
            (new LeasePolicy)->create($admin),
            'la policy doit rendre exactement ce que rend le résolveur',
        );
    }

    /**
     * Le `super_admin` reste autorisé sur les DEUX chemins, et c'est une
     * contrainte de non-régression, pas une évidence.
     *
     * Avant TCK-297, l'ability sans capacité passait quand même par
     * `$user->can('leases.view')` — donc par la Gate, donc par `Gate::before`,
     * qui rendait `true` même sur une policy instanciée nue. Une correction
     * qui se contenterait de `return false` pour une capacité nulle
     * retirerait ce bypass en appel direct, sans que rien ne le signale.
     * `BasePolicy::allows()` court-circuite donc explicitement sur
     * `isSuperAdmin()` — même convention que `PropertyPolicy::update` et
     * `MediaPolicy::viewRaw`, qui portent déjà ce check en dur.
     */
    public function test_super_admin_keeps_its_bypass_on_both_paths(): void
    {
        $agency = Agency::factory()->create();
        $lease = Lease::factory()->create(['agency_id' => $agency->id]);

        $superAdmin = User::factory()->create();
        $this->materializeRoleProfile($superAdmin, 'super_admin');

        $this->assertTrue(
            (new LeasePolicy)->view($superAdmin, $lease),
            'appel direct : le court-circuit isSuperAdmin() de BasePolicy',
        );

        $this->assertTrue(
            $superAdmin->can('view', $lease),
            'via la Gate : Gate::before',
        );
    }

    /**
     * `properties.create` et `properties.delete` EXISTENT dans l'enum : ces
     * deux-là n'ont jamais été cassés, et le refactor ne doit pas les casser.
     */
    public function test_property_policy_keeps_its_two_working_capabilities(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);

        $property = Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $admin->id,
        ]);

        $policy = new PropertyPolicy;

        $this->assertSame(
            $admin->canActAt(Capability::PropertiesCreate, $agency),
            $policy->create($admin),
        );

        $this->assertSame(
            $admin->canActAt(Capability::PropertiesDelete, $agency),
            $policy->delete($admin, $property),
        );

        $this->assertFalse(
            $policy->viewAny($admin),
            'properties.view n’existe pas — la lecture est portée par le scoping',
        );
    }
}
