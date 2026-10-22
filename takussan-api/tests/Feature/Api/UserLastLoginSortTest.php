<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\OperateursPlateforme;

/**
 * TCK-1280 (P150.01) — la colonne « Dernière connexion » de `/app/agency/team` écrit
 * `sort=last_login_at` ou `sort=-last_login_at` : l'API le refusait en 400, la liste tombait en erreur.
 * Les deux constructeurs de `GET /api/users` sont gardés : l'équipe d'une agence
 * (`buildAgencyTeamQuery`) et le super-admin (`buildQuery`). `/api/admin/users` tient sa propre liste.
 */
class UserLastLoginSortTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use OperateursPlateforme;
    use RefreshDatabase;

    private Agency $agency;

    /** @var list<int> du plus ancien au plus récent */
    private array $ordre = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        foreach (['2026-03-01', '2026-01-01', '2026-02-01'] as $date) {
            $user = User::factory()->create(['last_login_at' => $date.' 10:00:00']);
            AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->agency->id]);
            $this->ordre[$date] = $user->id;
        }
        ksort($this->ordre);
        $this->ordre = array_values($this->ordre);
    }

    /** @return array<string, array{0: string, 1: bool}> */
    public static function sens(): array
    {
        return [
            'montant' => ['last_login_at', false],
            'descendant' => ['-last_login_at', true],
        ];
    }

    #[DataProvider('sens')]
    public function test_l_equipe_de_l_agence_se_trie_par_derniere_connexion(string $tri, bool $inverse): void
    {
        $ids = $this->actingAsApi($this->agencyAdmin($this->agency))
            ->apiGet("/api/users?per_page=100&filter[role]=agent&filter[status]=active&sort={$tri}")
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame($inverse ? array_reverse($this->ordre) : $this->ordre, $this->saisis($ids));
    }

    #[DataProvider('sens')]
    public function test_le_super_admin_trie_aussi_par_derniere_connexion(string $tri, bool $inverse): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $ids = $this->getJson("/api/users?per_page=100&sort={$tri}")
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame($inverse ? array_reverse($this->ordre) : $this->ordre, $this->saisis($ids));
    }

    /**
     * Seuls les comptes créés ici comptent : l'administrateur ou l'opérateur peut aussi sortir.
     *
     * @param  list<int>  $ids
     * @return list<int>
     */
    private function saisis(array $ids): array
    {
        return array_values(array_filter($ids, fn (int $id) => in_array($id, $this->ordre, true)));
    }
}
