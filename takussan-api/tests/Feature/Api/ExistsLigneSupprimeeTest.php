<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * P96.02 (TCK-1336) — une ligne supprimée en douceur suit le chemin de l'identifiant absent : 422
 * sur le champ. Avant, la règle `exists:` l'acceptait, puis le contrôleur ou le service la relisait
 * par `findOrFail()` sous la portée `SoftDeletes` : 404 `http.not_found`, une page « introuvable »
 * au lieu d'une erreur sur le champ du formulaire.
 */
class ExistsLigneSupprimeeTest extends ApiTestCase
{
    use RefreshDatabase;

    private const ABSENT = 99_999_999;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        // Un second facteur : déclarer une absence est un geste protégé.
        $this->admin = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $this->agency = Agency::factory()->create(['primary_admin_id' => $this->admin->id]);
        $this->materializeRoleProfile($this->admin, 'agency_admin', $this->agency);
    }

    /** @return array<string, array{0: string}> */
    public static function chemins(): array
    {
        return [
            'client d\'une facture' => ['facture'],
            'agent responsable d\'un bien' => ['agent_du_bien'],
            'absent d\'une absence' => ['absent'],
            'remplaçant d\'une absence' => ['remplacant'],
            'délégataire d\'un rôle' => ['delegataire'],
            'garant d\'un bail' => ['garant'],
            'membre ajouté à l\'agence' => ['membre'],
        ];
    }

    /** @return array{0: int, 1: string} [id d'une ligne supprimée, champ] */
    private function ligneSupprimee(string $chemin): array
    {
        return match ($chemin) {
            'facture' => [$this->supprime(Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->admin->id])), 'customer_id'],
            'garant' => [$this->supprime(Guarantor::factory()->create(['added_by_id' => $this->admin->id])), 'guarantor_id'],
            'remplacant' => [$this->supprime($this->agent()), 'substitute_id'],
            default => [$this->supprime($this->agent()), 'user_id'],
        };
    }

    private function supprime($model): int
    {
        $model->delete();

        return $model->id;
    }

    private function agent(): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'agent', $this->agency);

        return $user;
    }

    private function envoyer(string $chemin, int $id): TestResponse
    {
        $api = $this->actingAsApi($this->admin);

        return match ($chemin) {
            'facture' => $api->apiPost('/api/invoices', [
                'customer_id' => $id,
                'issue_date' => now()->toDateString(),
                'subtotal' => 100_000,
            ]),
            'agent_du_bien' => $api->apiPut('/api/properties/'.$this->bien()->id.'/assigned-agent', ['user_id' => $id]),
            'absent' => $api->apiPost("/api/agencies/{$this->agency->id}/absences", [
                'user_id' => $id,
                'substitute_id' => $this->agent()->id,
                'ends_at' => now()->addDays(5)->toIso8601String(),
            ]),
            'remplacant' => $api->apiPost("/api/agencies/{$this->agency->id}/absences", [
                'user_id' => $this->agent()->id,
                'substitute_id' => $id,
                'ends_at' => now()->addDays(5)->toIso8601String(),
            ]),
            'delegataire' => $api->apiPost("/api/agencies/{$this->agency->id}/role-delegations", [
                'user_id' => $id,
                'role' => 'agent',
                'ends_at' => now()->addWeek()->toIso8601String(),
            ]),
            'garant' => $api->apiPost('/api/leases/'.$this->bail()->id.'/guarantors', ['guarantor_id' => $id]),
            'membre' => $api->apiPost("/api/agencies/{$this->agency->id}/members", ['user_id' => $id, 'role' => 'agent']),
        };
    }

    private function bien(): Property
    {
        return Property::factory()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
    }

    private function bail(): Lease
    {
        $bien = $this->bien();

        return Lease::factory()->create([
            'property_id' => $bien->id,
            'landlord_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    #[DataProvider('chemins')]
    public function test_une_ligne_supprimee_rend_la_meme_erreur_que_l_identifiant_absent(string $chemin): void
    {
        [$id, $champ] = $this->ligneSupprimee($chemin);

        $this->envoyer($chemin, $id)->assertStatus(422)->assertJsonValidationErrors([$champ]);
        $this->envoyer($chemin, self::ABSENT)->assertStatus(422)->assertJsonValidationErrors([$champ]);
    }
}
