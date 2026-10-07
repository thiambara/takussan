<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-591 — le CRM de l'agence est celui de son personnel (AC16, AC17).
 */
class CustomerScopeTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
    }

    private function member(string $role): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, $role, $this->agency);

        return $user;
    }

    private function create(User $as)
    {
        return $this->actingAsApi($as)->apiPost('/api/customers', ['first_name' => 'Awa', 'last_name' => 'Diop']);
    }

    /** AC17 */
    public function test_only_staff_creates_a_customer(): void
    {
        $this->create(User::factory()->create())->assertForbidden();
        $this->create($this->member('owner'))->assertForbidden();
        $this->assertDatabaseCount('customers', 0);

        $this->create($this->member('agent'))
            ->assertCreated()
            ->assertJsonPath('data.agency_id', $this->agency->id);
        $this->create($this->member('agency_admin'))->assertCreated();
    }
}
