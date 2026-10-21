<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * P88.02 (TCK-1097) — une tâche, le référent d'un client, le remplaçant d'une absence et un
 * collaborateur ne se confient qu'au personnel JOIGNABLE de l'agence
 * (`PersonnelDeLAgence::estPersonnel()`) : un compte `blocked` est refusé en 422 sur chacun des
 * quatre chemins, alors que son profil d'agent reste actif. Témoin : un compte `inactive`, qui
 * reste joignable (`PrimaryPropertyContact::joignable()`), est accepté.
 */
class CompteBloqueNonAttribuableTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        // Un admin d'agence agit avec un second facteur : déclarer une absence est un geste protégé.
        $this->admin = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $this->materializeRoleProfile($this->admin, 'agency_admin', $this->agency);
    }

    private function agent(UserStatus $status): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'agent', $this->agency);
        $user->forceFill(['status' => $status])->save();

        return $user;
    }

    private function customer(): Customer
    {
        return Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->admin->id]);
    }

    /** @return array<string, array{0: string, 1: int}> chemin → [clé, statut attendu pour `inactive`] */
    public static function chemins(): array
    {
        return [
            'tâche' => ['tache', 201],
            'référent client' => ['referent', 200],
            'remplaçant d\'absence' => ['remplacant', 201],
            'collaborateur' => ['collaborateur', 201],
        ];
    }

    private function attribuer(string $chemin, User $cible): TestResponse
    {
        return match ($chemin) {
            'tache' => $this->actingAsApi($this->admin)->apiPost('/api/tasks', [
                'title' => 'Rappeler',
                'taskable_type' => Customer::class,
                'taskable_id' => $this->customer()->id,
                'assigned_to_id' => $cible->id,
            ]),
            'referent' => $this->actingAsApi($this->admin)
                ->apiPost("/api/customers/{$this->customer()->id}/primary-contact", ['user_id' => $cible->id]),
            'remplacant' => $this->actingAsApi($this->admin)->apiPost("/api/agencies/{$this->agency->id}/absences", [
                'user_id' => $this->agent(UserStatus::Active)->id,
                'substitute_id' => $cible->id,
                'ends_at' => now()->addDays(5)->toIso8601String(),
            ]),
            'collaborateur' => $this->collaborateur($cible),
        };
    }

    private function collaborateur(User $cible): TestResponse
    {
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agency->id]);
        $bien = Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agency->id]);

        return $this->actingAsApi($bailleur)->apiPost("/api/properties/{$bien->id}/collaborators", [
            'user_id' => $cible->id,
            'role' => CollaboratorRole::Agent->value,
        ]);
    }

    #[DataProvider('chemins')]
    public function test_un_compte_bloque_n_est_pas_attribuable(string $chemin, int $accepte): void
    {
        $reponse = $this->attribuer($chemin, $this->agent(UserStatus::Blocked))->assertStatus(422);

        match ($chemin) {
            'tache' => $reponse->assertJsonPath('code', 'task.assignee_not_staff'),
            'referent' => $reponse->assertJsonValidationErrors(['user_id' => __('crm.customers.primary_contact_not_staff')]),
            'remplacant' => $reponse->assertJsonValidationErrors(['substitute_id' => __('team_handover.absences.not_staff')]),
            'collaborateur' => $reponse->assertJsonValidationErrors(['user_id' => __('collaborators.not_in_agency')]),
        };
    }

    #[DataProvider('chemins')]
    public function test_un_compte_inactif_reste_attribuable(string $chemin, int $accepte): void
    {
        $this->attribuer($chemin, $this->agent(UserStatus::Inactive))->assertStatus($accepte);
    }
}
