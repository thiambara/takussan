<?php

namespace Tests\Unit\Policies;

use App\Models\Agency;
use App\Models\PrivacyRequest;
use App\Models\User;
use App\Policies\PrivacyRequestPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-897 (P12.07) — `PrivacyRequestPolicy` (TCK-601, ADR-0044 §4) : le registre des demandes de
 * droits est au super-admin SEUL, qui passe par `Gate::before`. Toute autre personne est refusée
 * par la policy elle-même.
 *
 * Le 403 de `PrivacyRequestRegistryTest` vient du middleware `super-admin`, avant que la policy soit
 * consultée : mesuré le 2026-10-18, ses quatre `return false` passés à `true` laissaient la suite du
 * registre verte. Ce test éprouve la seconde porte, celle qui tient le jour où la route sort du
 * préfixe `/api/admin/*`.
 */
class PrivacyRequestPolicyTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string}> */
    public static function rolesHorsPlateforme(): array
    {
        return [
            'admin d’agence' => ['agency_admin'],
            'agent' => ['agent'],
            'propriétaire' => ['owner'],
        ];
    }

    #[DataProvider('rolesHorsPlateforme')]
    public function test_la_policy_refuse_toute_ability_a_qui_n_est_pas_super_admin(string $role): void
    {
        $user = $this->userWithRole($role);
        $entry = $this->entry();
        $policy = new PrivacyRequestPolicy;

        $this->assertFalse($policy->viewAny($user), 'viewAny');
        $this->assertFalse($policy->create($user), 'create');
        $this->assertFalse($policy->update($user, $entry), 'update');
        $this->assertFalse($policy->export($user), 'export');
    }

    #[DataProvider('rolesHorsPlateforme')]
    public function test_la_gate_refuse_toute_ability_a_qui_n_est_pas_super_admin(string $role): void
    {
        $gate = Gate::forUser($this->userWithRole($role));
        $entry = $this->entry();

        $this->assertTrue($gate->denies('viewAny', PrivacyRequest::class), 'viewAny');
        $this->assertTrue($gate->denies('create', PrivacyRequest::class), 'create');
        $this->assertTrue($gate->denies('update', $entry), 'update');
        $this->assertTrue($gate->denies('export', PrivacyRequest::class), 'export');
    }

    public function test_la_gate_accorde_tout_au_super_admin(): void
    {
        $gate = Gate::forUser($this->userWithRole('super_admin'));
        $entry = $this->entry();

        $this->assertTrue($gate->allows('viewAny', PrivacyRequest::class), 'viewAny');
        $this->assertTrue($gate->allows('create', PrivacyRequest::class), 'create');
        $this->assertTrue($gate->allows('update', $entry), 'update');
        $this->assertTrue($gate->allows('export', PrivacyRequest::class), 'export');
    }

    private function userWithRole(string $role): User
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, $role, $agency);

        return $user->fresh();
    }

    private function entry(): PrivacyRequest
    {
        return PrivacyRequest::query()->create([
            'type' => 'access', 'channel' => 'email', 'requester_name' => 'X', 'received_at' => now(),
        ]);
    }
}
