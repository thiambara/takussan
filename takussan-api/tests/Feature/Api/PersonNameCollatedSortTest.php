<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\OperateursPlateforme;

/**
 * TCK-1136 (P87.01) — les listes de personnes trient prénoms et noms en `COLLATE "und-x-icu"`
 * (ADR-0025, amendement du 2026-10-19), en tri montant comme descendant.
 *
 * La base est en `--locale=C` : un `ORDER BY first_name` nu suit l'ordre des octets, et une
 * minuscule ou une initiale accentuée passait après « Z » (« Binta | Zeynab | awa | Élodie »).
 */
class PersonNameCollatedSortTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use OperateursPlateforme;
    use RefreshDatabase;

    private const PRENOMS = ['Zeynab', 'awa', 'Élodie', 'Binta'];

    private const ORDRE = ['awa', 'Binta', 'Élodie', 'Zeynab'];

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        foreach (self::PRENOMS as $prenom) {
            $user = User::factory()->create(['first_name' => $prenom, 'last_name' => 'Membre']);
            AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->agency->id]);
        }
    }

    /** @return array<string, array{0: string, 1: list<string>}> */
    public static function sens(): array
    {
        return [
            'montant' => ['first_name', self::ORDRE],
            'descendant' => ['-first_name', array_reverse(self::ORDRE)],
        ];
    }

    #[DataProvider('sens')]
    public function test_les_membres_d_une_agence(string $tri, array $attendu): void
    {
        $admin = $this->adminHomonyme();
        $membres = $this->actingAsApi($admin)
            ->apiGet("/api/agencies/{$this->agency->id}/members?per_page=100&sort={$tri}")
            ->assertOk()
            ->json('data');

        $this->assertSame($attendu, $this->saisis($membres, $admin));
    }

    #[DataProvider('sens')]
    public function test_l_equipe_de_l_agence(string $tri, array $attendu): void
    {
        $admin = $this->adminHomonyme();
        $membres = $this->actingAsApi($admin)
            ->apiGet("/api/users?per_page=100&sort={$tri}")
            ->assertOk()
            ->json('data');

        $this->assertSame($attendu, $this->saisis($membres, $admin));
    }

    #[DataProvider('sens')]
    public function test_les_comptes_de_la_console(string $tri, array $attendu): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $prenoms = $this->getJson("/api/admin/users?per_page=100&filter[agency_id]={$this->agency->id}&sort={$tri}")
            ->assertOk()
            ->json('data.*.first_name');

        $this->assertSame($attendu, $prenoms);
    }

    public function test_les_comptes_de_la_console_se_departagent_par_id(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $homonymes = [];
        foreach (range(1, 3) as $_) {
            $user = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Homonyme']);
            AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->agency->id]);
            $homonymes[] = $user->id;
        }

        $ids = collect($this->getJson("/api/admin/users?per_page=100&filter[agency_id]={$this->agency->id}&sort=first_name")
            ->assertOk()
            ->json('data'))
            ->where('last_name', 'Homonyme')
            ->pluck('id')->values()->all();

        $this->assertSame($homonymes, $ids);
    }

    /** @return array<string, array{0: string, 1: list<string>}> */
    public static function sensClients(): array
    {
        $ordre = ['Ba', 'diop', 'Écrivain', 'Zola'];

        return [
            'montant' => ['last_name,first_name', $ordre],
            'descendant' => ['-last_name,first_name', array_reverse($ordre)],
        ];
    }

    #[DataProvider('sensClients')]
    public function test_les_clients(string $tri, array $attendu): void
    {
        foreach (['Zola', 'diop', 'Écrivain', 'Ba'] as $nom) {
            Customer::factory()->create(['agency_id' => $this->agency->id, 'first_name' => 'Client', 'last_name' => $nom]);
        }

        $noms = $this->actingAsApi($this->agencyAdmin($this->agency))
            ->apiGet("/api/customers?per_page=100&sort={$tri}")
            ->assertOk()
            ->json('data.*.last_name');

        $this->assertSame($attendu, $noms);
    }

    /**
     * L'administrateur de l'agence est lui-même membre, et la réponse le porte. Son prénom vient de
     * Faker, en `fr_FR` sur la CI, dont la liste contient « Élodie » : filtré par prénom, il
     * doublait une fois sur 260 l'« Élodie » saisie (`pre-dev`, run 39884689833). Il porte donc
     * délibérément ce prénom, et il est écarté par son identifiant.
     */
    private function adminHomonyme(): User
    {
        $admin = $this->agencyAdmin($this->agency);
        $admin->update(['first_name' => 'Élodie']);

        return $admin;
    }

    /**
     * Seul l'ordre relatif des prénoms saisis compte : l'administrateur est écarté par son id.
     *
     * @param  list<array<string, mixed>>  $membres
     * @return list<string>
     */
    private function saisis(array $membres, User $admin): array
    {
        return collect($membres)
            ->reject(fn (array $membre) => $membre['id'] === $admin->id)
            ->pluck('first_name')
            ->values()
            ->all();
    }
}
