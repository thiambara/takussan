<?php

namespace Tests\Feature\Validation;

use App\Models\Customer;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Support\EnvoisParCode;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2752 — une date-heure mal formée est refusée (422) au lieu d'être relue comme une autre date,
 * par HTTP — middleware compris. Mesuré sur HEAD avant la règle (2026-11-13) : la règle `date` laissait
 * passer les trois formes ci-dessous, et chacune s'écrivait (201/200) à une autre date que celle
 * envoyée.
 *
 * Un octet nul FINAL n'est pas ici : `TrimStrings` le retire avant la validation, et la valeur restante
 * est juste. L'octet nul INTÉRIEUR, lui, traverse le middleware : `2026-12-01T10:00\0+05:00` était
 * relu 05:00 UTC.
 *
 * La forme est posée sur CHAQUE champ que la garde de TCK-2743 relève : c'est
 * `InstantRecuConvertiTest::test_toute_date_heure_recue_porte_la_forme_iso` qui le tient, et
 * `Tests\Unit\Rules\InstantIsoTest` qui juge la règle forme par forme. Ici, trois écrivains sans
 * `after:now` — là où la forme relue s'écrivait —, et la branche « personnel » d'une visite.
 */
class InstantIsoRecuTest extends ApiTestCase
{
    use EnvoisParCode;
    use FabriqueDemandesEtVisites;
    use MaintenanceActors;
    use RefreshDatabase;

    /** @return array<string, array{0: string}> */
    public static function formesRelues(): array
    {
        return [
            'année à cinq chiffres (relue 2009-01-01)' => ['99999-01-01'],
            'année à zéros de tête (relue l’an 99)' => ['0099-01-01'],
            // Dans l'horizon d'un passage (un an, TCK-2715) : sinon `DansLHorizonDuPassage` le refuse seul.
            'octet nul intérieur (relu 05:00 UTC)' => ["2026-12-01T10:00\0+05:00"],
        ];
    }

    private function tache(User $user, mixed $dueAt): TestResponse
    {
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        return $this->postJson('/api/tasks', [
            'title' => 'Rappeler Awa', 'taskable_id' => $customer->id, 'taskable_type' => Customer::class, 'due_at' => $dueAt,
        ]);
    }

    #[DataProvider('formesRelues')]
    public function test_ac1_une_echeance_relue_de_travers_est_refusee(string $forme): void
    {
        Sanctum::actingAs($user = User::factory()->create());

        $this->tache($user, $forme)->assertUnprocessable()->assertJsonValidationErrors(['due_at']);
        $this->assertSame(0, Task::query()->count());

        $id = $this->tache($user, '2030-11-20T10:00:00Z')->assertCreated()->json('data.id');
        $this->patchJson("/api/tasks/{$id}", ['due_at' => $forme])->assertUnprocessable()->assertJsonValidationErrors(['due_at']);
        $this->assertSame('2030-11-20 10:00:00', Task::query()->findOrFail($id)->getRawOriginal('due_at'));
    }

    #[DataProvider('formesRelues')]
    public function test_ac1_le_passage_d_une_intervention_relu_de_travers_est_refuse(string $forme): void
    {
        $this->travelTo(Carbon::parse('2026-11-11 08:00:00', 'UTC'));
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => null]);
        Sanctum::actingAs($landlord);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => $forme])
            ->assertUnprocessable()->assertJsonValidationErrors(['scheduled_at']);
        $this->assertNull(MaintenanceRequest::query()->findOrFail($mr->id)->getRawOriginal('scheduled_at'));
    }

    public function test_ac1_l_agence_qui_planifie_une_visite_avec_un_octet_nul_est_refusee(): void
    {
        Notification::fake();
        $agence = $this->agence();
        $bien = $this->bienDe($agence);
        Sanctum::actingAs($this->personnel($agence));

        $this->postJson('/api/property-visits', [
            'property_id' => $bien->id,
            'scheduled_at' => substr($this->creneau(3, 10), 0, 16)."\0+05:00",
            'visitor_name' => 'Awa Diop',
            'visitor_phone' => '+221771234567',
        ])->assertUnprocessable()->assertJsonValidationErrors(['scheduled_at']);
        $this->assertSame(0, PropertyVisit::query()->where('property_id', $bien->id)->count());
    }

    /** @return array<string, array{0: string, 1: string}> la forme envoyée, l'instant stocké (UTC) */
    public static function formesAdmises(): array
    {
        return [
            'Z' => ['2030-11-20T10:00:00Z', '2030-11-20 10:00:00'],
            'toISOString()' => ['2030-11-20T10:00:00.000Z', '2030-11-20 10:00:00'],
            'Carbon, six chiffres' => ['2030-11-20T10:00:00.000000Z', '2030-11-20 10:00:00'],
            'décalage' => ['2030-11-20T11:00:00+01:00', '2030-11-20 10:00:00'],
            'décalage basique' => ['2030-11-20T08:00:00-0200', '2030-11-20 10:00:00'],
            'sans décalage (Dakar)' => ['2030-11-20T10:00:00', '2030-11-20 10:00:00'],
            'espace (fin d’absence du front)' => ['2030-11-20 10:00:00', '2030-11-20 10:00:00'],
            'minutes seules' => ['2030-11-20T10:00', '2030-11-20 10:00:00'],
            'date seule' => ['2030-11-20', '2030-11-20 00:00:00'],
            'octet nul final (retiré par TrimStrings)' => ["2030-11-20T10:00:00Z\0", '2030-11-20 10:00:00'],
        ];
    }

    #[DataProvider('formesAdmises')]
    public function test_ac2_les_formes_iso_valides_restent_admises_et_converties(string $forme, string $stocke): void
    {
        Sanctum::actingAs($user = User::factory()->create());

        $id = $this->tache($user, $forme)->assertCreated()->json('data.id');

        $this->assertSame($stocke, Task::query()->findOrFail($id)->getRawOriginal('due_at'));
    }
}
