<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1069 (P62.03) — `POST /api/tasks` n'énumère plus les comptes de la plateforme ni les fiches
 * des autres agences. `exists:users,id` rendait 422 pour un compte absent avant même que le parent
 * soit résolu ; un parent tiers rendait 403 et un parent absent 404. Le parent refusé rend désormais
 * le 404 d'un parent absent, comme `DocumentController::store()` (TCK-732), et l'assigné absent la
 * réponse d'un assigné hors personnel.
 */
class TaskExistenceOracleTest extends TestCase
{
    use RefreshDatabase;

    private const ABSENT = 99999999;

    private Agency $tierce;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tierce = Agency::factory()->create();
    }

    /** @param  array<string, mixed>  $overrides */
    private function task(array $overrides): TestResponse
    {
        return $this->postJson('/api/tasks', $overrides + ['title' => 'Relance']);
    }

    /** @return array{0: int, 1: mixed} */
    private function verdict(TestResponse $response): array
    {
        return [$response->status(), $response->json()];
    }

    public function test_un_compte_absent_ne_se_distingue_pas_d_un_compte_existant(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $existant = User::factory()->create();

        $avecExistant = $this->verdict($this->task(['taskable_id' => self::ABSENT, 'taskable_type' => Customer::class, 'assigned_to_id' => $existant->id]));
        $avecAbsent = $this->verdict($this->task(['taskable_id' => self::ABSENT, 'taskable_type' => Customer::class, 'assigned_to_id' => self::ABSENT]));

        $this->assertSame(404, $avecExistant[0]);
        $this->assertSame($avecExistant, $avecAbsent);
    }

    public function test_un_parent_tiers_recoit_le_404_d_un_parent_absent(): void
    {
        Sanctum::actingAs(User::factory()->create());

        foreach ([
            Customer::class => Customer::factory()->create(['agency_id' => $this->tierce->id]),
            Property::class => Property::factory()->create(['agency_id' => $this->tierce->id]),
        ] as $type => $tiers) {
            $deTiers = $this->verdict($this->task(['taskable_id' => $tiers->id, 'taskable_type' => $type]));
            $absent = $this->verdict($this->task(['taskable_id' => self::ABSENT, 'taskable_type' => $type]));

            $this->assertSame(404, $deTiers[0], $type);
            $this->assertSame($deTiers, $absent, $type);
        }
        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_sur_son_parent_un_assigne_absent_recoit_la_reponse_d_un_assigne_hors_personnel(): void
    {
        $agent = User::factory()->withAgentProfile($this->tierce)->create();
        Sanctum::actingAs($agent);
        $customer = Customer::factory()->create(['agency_id' => $this->tierce->id]);

        $horsPersonnel = $this->verdict($this->task(['taskable_id' => $customer->id, 'taskable_type' => Customer::class, 'assigned_to_id' => User::factory()->create()->id]));
        $absent = $this->verdict($this->task(['taskable_id' => $customer->id, 'taskable_type' => Customer::class, 'assigned_to_id' => self::ABSENT]));

        $this->assertSame(422, $horsPersonnel[0]);
        $this->assertSame('task.assignee_not_staff', $horsPersonnel[1]['code'] ?? null);
        $this->assertSame($horsPersonnel, $absent);
        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_le_super_admin_ne_peut_pas_assigner_un_compte_absent(): void
    {
        $this->actingAsRole('super_admin');
        $customer = Customer::factory()->create(['agency_id' => $this->tierce->id]);

        $this->task(['taskable_id' => $customer->id, 'taskable_type' => Customer::class, 'assigned_to_id' => self::ABSENT])
            ->assertStatus(422)
            ->assertJsonPath('code', 'task.assignee_not_staff');
        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_un_assigne_non_entier_reste_refuse_en_422(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->task(['taskable_id' => 1, 'taskable_type' => Customer::class, 'assigned_to_id' => 'abc'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['assigned_to_id']);
    }
}
