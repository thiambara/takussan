<?php

namespace Tests\Feature\Agency;

use App\Models\AccountDeletionRequest;
use App\Models\Agency;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2744 (d2) — le retrait d'un membre et l'effacement d'un compte prennent leurs verrous dans
 * l'ordre de tout le dépôt, bien → visite → utilisateur, celui des écrivains de visites
 * (`VisitSchedulingService::verrouillerBienPuisVisite`). Le retrait verrouillait le membre PUIS les
 * biens dont il est l'agent principal : contre la confirmation d'une de ses visites sur un tel bien
 * (bien → visite → agent), 20 interblocages (40P01) sur 20 courses. L'effacement écrivait les
 * visites et le compte avant de verrouiller ces biens.
 *
 * L'ordre se lit sur les `select … for update` émis : la PREMIÈRE apparition de chaque table.
 */
class OrdreDesVerrousDuRetraitTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    /** @var list<array{table: string, where: string, bindings: array<int, mixed>}> */
    private array $verrous = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = $this->membre('agency_admin');
        $this->membre('agency_admin');

        DB::listen(function ($q): void {
            if (preg_match('/from "(properties|property_visits|users)" where (.*) for update/', $q->sql, $m) === 1) {
                $this->verrous[] = ['table' => $m[1], 'where' => $m[2], 'bindings' => $q->bindings];
            }
        });
    }

    private function membre(string $role): User
    {
        $user = User::factory()->create($role === 'agency_admin'
            ? ['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]
            : []);
        $this->materializeRoleProfile($user, $role, $this->agency);

        return $user;
    }

    private function bien(): Property
    {
        return Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->membre('owner')->id]);
    }

    private function marquer(Property $bien, User $agent): void
    {
        // `is_primary` n'est pas `fillable` (ADR-0053) : posée à la main, comme le fait la fixture
        // de `RepairReassignedOwnersCommandTest`.
        PropertyCollaborator::query()->create([
            'property_id' => $bien->id, 'user_id' => $agent->id, 'role' => CollaboratorRole::Agent, 'invited_at' => now(),
        ])->forceFill(['is_primary' => true])->save();
    }

    /** @return list<string> */
    private function ordreDesPremiersVerrous(): array
    {
        $premiers = [];
        foreach ($this->verrous as $i => $verrou) {
            $premiers[$verrou['table']] ??= $i;
        }

        return array_keys($premiers);
    }

    public function test_le_retrait_verrouille_les_biens_marques_avant_le_membre(): void
    {
        $agent = $this->membre('agent');
        $marque = $this->bien();
        $this->marquer($marque, $agent);
        PropertyVisit::factory()->create([
            'property_id' => $marque->id, 'agent_id' => $agent->id,
            'status' => VisitStatus::Confirmed, 'scheduled_at' => now()->addDays(2),
        ]);
        $this->verrous = [];

        $this->actingAsApi($this->admin)
            ->deleteJson("/api/agencies/{$this->agency->id}/members/{$agent->id}", ['leave_unassigned' => true])
            ->assertOk();

        $this->assertSame(['properties', 'users'], array_values(array_diff($this->ordreDesPremiersVerrous(), ['property_visits'])));
        $this->assertSame([$marque->id], $this->verrous[0]['bindings'], 'le premier verrou : le bien marqué');
        $this->assertFalse((bool) PropertyCollaborator::query()->where('user_id', $agent->id)->value('is_primary'), 'la marque tombe toujours');
    }

    public function test_l_effacement_verrouille_biens_puis_visites_puis_compte_avant_toute_ecriture(): void
    {
        Notification::fake();

        $user = $this->membre('agent');
        $marque = $this->bien();
        $this->marquer($marque, $user);
        $accompagne = $this->bien();
        $demande = $this->bien();
        $aVenir = PropertyVisit::factory()->create([
            'property_id' => $accompagne->id, 'agent_id' => $user->id,
            'status' => VisitStatus::Confirmed, 'scheduled_at' => now()->addDays(2),
        ]);
        $passee = PropertyVisit::factory()->create([
            'property_id' => $this->bien()->id, 'agent_id' => $user->id,
            'status' => VisitStatus::Completed, 'scheduled_at' => now()->subDays(2),
        ]);
        $visiteur = PropertyVisit::factory()->create(['property_id' => $demande->id, 'visitor_id' => $user->id]);
        $request = AccountDeletionRequest::factory()->for($user)->due()->create();

        $ecritures = [];
        DB::listen(function ($q) use (&$ecritures): void {
            if (preg_match('/^(update|insert into|delete from) "(properties|property_visits|users|property_collaborators|customers)"/', $q->sql, $m) === 1) {
                $ecritures[] = count($this->verrous);
            }
        });
        $this->verrous = [];

        app(AccountDeletionService::class)->executeDeletion($request);

        $this->assertSame(['properties', 'property_visits', 'users'], $this->ordreDesPremiersVerrous());

        $biens = collect([$marque->id, $accompagne->id, $demande->id])->sort()->values()->all();
        $this->assertSame($biens, $this->verrous[0]['bindings'], 'UNE passe, par identifiant croissant : les biens des visites détachées et le bien marqué — pas celui de la visite passée');
        // Les visites, par le prédicat même des deux `update` qui les écrivent — demandées par le
        // compte, ou à venir et accompagnées par lui —, en ordre d'identifiant.
        $this->assertSame(
            [$user->id, $user->id, VisitStatus::Scheduled->value, VisitStatus::Confirmed->value],
            $this->verrous[1]['bindings'],
        );
        $this->assertStringEndsWith('order by "id" asc', $this->verrous[1]['where']);

        // `$ecritures` retient, pour chaque écriture, le nombre de verrous déjà pris : la première
        // doit venir APRÈS le verrou du compte (rang `$rangDuCompte`, donc au moins rang + 1 verrous).
        $rangDuCompte = array_search('users', array_column($this->verrous, 'table'), true);
        $this->assertNotEmpty($ecritures);
        $this->assertGreaterThan($rangDuCompte, min($ecritures), 'aucune écriture avant que le compte soit verrouillé');

        $this->assertNull($aVenir->fresh()->agent_id);
        $this->assertSame($user->id, $passee->fresh()->agent_id);
        $this->assertNull($visiteur->fresh()->visitor_id);
    }
}
