<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Services\Maintenance\MaintenanceQueue;
use App\Services\Model\MaintenanceRequestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2652 (AC1, AC2) — la table des files : chaque statut × prestataire présent ou non × créneau
 * passé ou non tombe dans UNE file, la même pour la ligne (`file` de la ressource) et pour le filtre
 * (`filter[file]`), et c'est celle de la table écrite ci-dessous.
 */
class MaintenanceQueueMappingTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /**
     * La table attendue, écrite à la main (pas recalculée) : par statut, la file et l'attente dans
     * les quatre cas [prestataire+créneau passé, prestataire+sinon, sans+passé, sans+sinon]. Un statut
     * ajouté à l'énumération et absent d'ici fait rougir {@see self::test_every_case_has_exactly_one_file()}.
     */
    private const EXPECTED = [
        'open' => [['en_retard', 'provider'], ['en_cours', 'provider'], ['a_dispatcher', 'agency'], ['a_dispatcher', 'agency']],
        'acknowledged' => [['en_retard', 'provider'], ['en_cours', 'provider'], ['a_dispatcher', 'agency'], ['a_dispatcher', 'agency']],
        'assigned' => [['en_retard', 'provider'], ['en_cours', 'provider'], ['a_dispatcher', 'agency'], ['a_dispatcher', 'agency']],
        'rejected' => [['en_cours', 'provider'], ['en_cours', 'provider'], ['a_dispatcher', 'agency'], ['a_dispatcher', 'agency']],
        'quote_requested' => [['en_cours', 'provider'], ['en_cours', 'provider'], ['en_cours', 'provider'], ['en_cours', 'provider']],
        'quote_submitted' => [['en_cours', 'agency'], ['en_cours', 'agency'], ['en_cours', 'agency'], ['en_cours', 'agency']],
        'awaiting_owner' => [['chez_le_bailleur', 'owner'], ['chez_le_bailleur', 'owner'], ['chez_le_bailleur', 'owner'], ['chez_le_bailleur', 'owner']],
        'approved' => [['en_retard', 'provider'], ['en_cours', 'provider'], ['en_retard', 'provider'], ['en_cours', 'provider']],
        'in_progress' => [['en_retard', 'provider'], ['en_cours', 'provider'], ['en_retard', 'provider'], ['en_cours', 'provider']],
        'completed' => [['a_confirmer', 'tenant'], ['a_confirmer', 'tenant'], ['a_confirmer', 'tenant'], ['a_confirmer', 'tenant']],
        'closed' => [['terminees', 'none'], ['terminees', 'none'], ['terminees', 'none'], ['terminees', 'none']],
        'cancelled' => [['terminees', 'none'], ['terminees', 'none'], ['terminees', 'none'], ['terminees', 'none']],
    ];

    /** @return iterable<string, array{MaintenanceStatus, bool, bool}> */
    public static function cases(): iterable
    {
        foreach (MaintenanceStatus::cases() as $status) {
            foreach ([true, false] as $provider) {
                foreach ([true, false] as $past) {
                    yield sprintf('%s, %s, %s', $status->value, $provider ? 'prestataire' : 'sans prestataire', $past ? 'créneau passé' : 'sinon') => [$status, $provider, $past];
                }
            }
        }
    }

    private static function index(bool $provider, bool $past): int
    {
        return ($provider ? 0 : 2) + ($past ? 0 : 1);
    }

    /** AC1 — 12 statuts × 2 × 2 : une file des six, la file de la table. */
    #[DataProvider('cases')]
    public function test_every_case_has_exactly_one_file(MaintenanceStatus $status, bool $provider, bool $past): void
    {
        $this->assertArrayHasKey($status->value, self::EXPECTED, "Le statut {$status->value} n'est pas classé dans la table des files.");

        [$file, $waitingOn] = MaintenanceQueue::classify($status, $provider, $past);

        $this->assertSame(self::EXPECTED[$status->value][self::index($provider, $past)], [$file, $waitingOn]);
        $this->assertCount(1, array_keys(MaintenanceQueue::FILES, $file, true));
    }

    public function test_the_table_covers_exactly_the_enumeration(): void
    {
        $enum = array_map(fn (MaintenanceStatus $s) => $s->value, MaintenanceStatus::cases());
        $table = array_keys(self::EXPECTED);
        sort($enum);
        sort($table);

        $this->assertSame($enum, $table);
    }

    /**
     * AC1, côté base — les 48 cas posés ensemble : chaque demande sort par UN seul `filter[file]`, et
     * c'est la `file` que sa ligne annonce. Bornes du créneau : la veille à 23:59 de Dakar est passée,
     * le jour même à 00:00 ne l'est pas.
     */
    public function test_the_filter_and_the_row_agree_on_every_case(): void
    {
        $this->travelTo(Carbon::parse('2026-11-11 10:00:00', 'Africa/Dakar'));
        ['mr' => $first, 'provider' => $provider, 'property' => $property, 'landlord' => $landlord] = $this->maintenanceScenario();
        $first->forceDelete();

        $expected = [];
        foreach (self::cases() as [$status, $withProvider, $past]) {
            $mr = MaintenanceRequest::factory()->create([
                'property_id' => $property->id,
                'requester_id' => $landlord->id,
                'assigned_to' => $withProvider ? $provider->id : null,
                'status' => $status,
                'scheduled_at' => Carbon::parse($past ? '2026-11-10 23:59:00' : '2026-11-11 00:00:00', 'Africa/Dakar')->utc(),
            ]);
            $expected[$mr->id] = self::EXPECTED[$status->value][self::index($withProvider, $past)][0];
        }

        Sanctum::actingAs($landlord);

        $rows = collect($this->getJson('/api/maintenance-requests?per_page=100')->assertOk()->json('data'))->keyBy('id');
        $this->assertCount(48, $rows);

        $seen = [];
        foreach (MaintenanceQueue::FILES as $file) {
            foreach ($this->getJson("/api/maintenance-requests?per_page=100&filter[file]={$file}")->assertOk()->json('data') as $row) {
                $seen[$row['id']][] = $file;
                $this->assertSame($file, $rows[$row['id']]['file']);
            }
        }

        foreach ($expected as $id => $file) {
            $this->assertSame([$file], $seen[$id] ?? [], "Demande {$id}");
        }
    }

    /** AC2 — la #8 de la démo : ouverte, sans prestataire, depuis le 14 sept. */
    public function test_ac2_an_open_request_without_provider_is_to_dispatch_since_its_creation(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Open, ['assigned_to' => null]);
        MaintenanceRequest::query()->whereKey($mr->id)->update(['created_at' => '2026-09-14 20:56:29', 'queue_entered_at' => null]);
        $this->travelTo(Carbon::parse('2026-11-11 10:00:00', 'Africa/Dakar'));

        Sanctum::actingAs($landlord);
        $row = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->json('data');

        $this->assertSame('a_dispatcher', $row['file']);
        $this->assertSame('agency', $row['waiting_on']);
        $this->assertSame('2026-09-14T20:56:29+00:00', $row['waiting_since']);
        $this->assertNull($row['slot_overdue_days']);
    }

    /** AC2 — la #9 : en cours, créneau du 27 sept. : en retard de 45 jours au 11 nov. */
    public function test_ac2_an_in_progress_request_past_its_slot_is_late_by_whole_days(): void
    {
        $this->travelTo(Carbon::parse('2026-11-11 10:00:00', 'Africa/Dakar'));
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress, [
            'scheduled_at' => '2026-09-27 17:39:36',
            'accepted_at' => '2026-09-24 10:00:00',
        ]);

        Sanctum::actingAs($landlord);
        $row = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->json('data');

        $this->assertSame('en_retard', $row['file']);
        $this->assertSame('provider', $row['waiting_on']);
        $this->assertGreaterThanOrEqual(44, $row['slot_overdue_days']);
        $this->assertSame(45, $row['slot_overdue_days']);
    }

    /** `auto_close_at` : la fin de travaux plus le délai de la clôture automatique. */
    public function test_a_completed_request_announces_its_automatic_closing(): void
    {
        ['mr' => $mr, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => '2026-11-09 22:59:59']);

        Sanctum::actingAs($tenant);
        $row = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->json('data');

        $this->assertSame('a_confirmer', $row['file']);
        $this->assertSame('tenant', $row['waiting_on']);
        $this->assertSame('2026-11-16T22:59:59+00:00', $row['auto_close_at']);
    }

    /** `waiting_since` suit chaque changement de statut ; une autre écriture ne la touche pas. */
    public function test_queue_entered_at_follows_every_status_change(): void
    {
        $this->travelTo(Carbon::parse('2026-11-01 09:00:00'));
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        $this->assertSame('2026-11-01 09:00:00', $mr->fresh()->queue_entered_at->toDateTimeString());

        $this->travelTo(Carbon::parse('2026-11-03 09:00:00'));
        $mr->fresh()->update(['title' => 'Fuite sous l\'évier']);
        $this->assertSame('2026-11-01 09:00:00', $mr->fresh()->queue_entered_at->toDateTimeString());

        $this->travelTo(Carbon::parse('2026-11-05 09:00:00'));
        app(MaintenanceRequestService::class)->accept($mr->fresh(), $provider);
        Sanctum::actingAs($provider);
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'in_progress'])->assertOk();

        $this->assertSame('2026-11-05 09:00:00', $mr->fresh()->queue_entered_at->toDateTimeString());
        $this->assertSame('2026-11-05T09:00:00+00:00', $this->getJson("/api/maintenance-requests/{$mr->id}")->json('data.waiting_since'));
    }

    /**
     * Décision de la session (2026-11-11) — `waiting_since` est l'entrée dans la FILE courante : le
     * dispatch, le refus du prestataire et la réassignation changent le destinataire sans changer le
     * statut (`open`), et remettent l'ancienneté à zéro. Un prestataire ne lit pas « depuis le
     * 14 sept. » une demande reçue à l'instant.
     */
    public function test_dispatch_decline_and_reassignment_restart_the_waiting(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Open, ['assigned_to' => null]);
        MaintenanceRequest::query()->whereKey($mr->id)->update(['created_at' => '2026-09-14 20:56:29', 'queue_entered_at' => '2026-09-14 20:56:29']);
        $other = $this->providerFor($agency);
        $read = function ($user) use ($mr): array {
            Sanctum::actingAs($user);

            return $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->json('data');
        };

        $this->travelTo(Carbon::parse('2026-11-11 10:00:00'));
        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $provider->id])->assertOk();
        $row = $read($provider);
        $this->assertSame(['open', 'en_cours', 'provider', '2026-11-11T10:00:00+00:00'], [$row['status'], $row['file'], $row['waiting_on'], $row['waiting_since']]);

        $this->travelTo(Carbon::parse('2026-11-11 11:00:00'));
        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/decline", ['reason' => 'Pas disponible cette semaine'])->assertOk();
        $row = $read($landlord);
        $this->assertSame(['open', 'a_dispatcher', 'agency', '2026-11-11T11:00:00+00:00'], [$row['status'], $row['file'], $row['waiting_on'], $row['waiting_since']]);

        $this->travelTo(Carbon::parse('2026-11-11 12:00:00'));
        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $other->id])->assertOk();
        $this->assertSame('2026-11-11T12:00:00+00:00', $read($other)['waiting_since']);
    }

    /**
     * Une demande créée DÉJÀ datée (seeders, import) n'attend pas « depuis aujourd'hui » : l'entrée
     * dans son statut est la colonne qui date le geste, sinon sa création.
     */
    public function test_a_backdated_creation_keeps_its_own_dates(): void
    {
        $this->travelTo(Carbon::parse('2026-11-11 10:00:00'));
        ['mr' => $first, 'property' => $property, 'tenant' => $tenant] = $this->maintenanceScenario();

        // Comme les seeders (`Seeder::__invoke` lève la protection d'affectation de masse).
        [$open, $done] = MaintenanceRequest::unguarded(fn (): array => [MaintenanceRequest::query()->create([
            'property_id' => $property->id, 'requester_id' => $tenant->id, 'title' => 'Fuite', 'description' => 'Évier',
            'category' => 'plumbing', 'status' => MaintenanceStatus::Open,
            'created_at' => '2026-09-14 20:56:29', 'updated_at' => '2026-09-20 08:00:00',
        ]), MaintenanceRequest::query()->create([
            'property_id' => $property->id, 'requester_id' => $tenant->id, 'title' => 'Prise', 'description' => 'Salon',
            'category' => 'electrical', 'status' => MaintenanceStatus::Completed,
            'completed_at' => '2026-11-02 12:00:00', 'created_at' => '2026-10-01 09:00:00',
        ])]);

        $this->assertSame('2026-09-14 20:56:29', $open->fresh()->queue_entered_at->toDateTimeString());
        $this->assertSame('2026-11-02 12:00:00', $done->fresh()->queue_entered_at->toDateTimeString());
        $this->assertSame('2026-11-11 10:00:00', $first->fresh()->queue_entered_at->toDateTimeString());
    }

    /** Une colonne de la table absente du sparse fieldset : aucune file plutôt qu'une file fausse. */
    public function test_a_sparse_fieldset_without_the_table_columns_yields_no_file(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['scheduled_at' => now()->subWeek()]);

        Sanctum::actingAs($landlord);
        $sans = $this->getJson('/api/maintenance-requests?fields[maintenance_requests]=id,status')->assertOk()->json('data.0');
        $avec = $this->getJson('/api/maintenance-requests?fields[maintenance_requests]=id,status,assigned_to,scheduled_at,queue_entered_at')->assertOk()->json('data.0');

        $this->assertSame($mr->id, $sans['id']);
        $this->assertNull($sans['file']);
        $this->assertSame('en_retard', $avec['file']);
        $this->assertNotNull($avec['waiting_since']);
    }

    /** Une valeur inconnue, ou une liste `filter[file][]=`, ne rend rien ; une liste à virgules, l'union. */
    public function test_unknown_values_yield_nothing_and_a_comma_list_the_union(): void
    {
        ['mr' => $late, 'landlord' => $landlord, 'property' => $property] = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => now()->subDays(3)]);
        $toDispatch = MaintenanceRequest::factory()->create(['property_id' => $property->id, 'requester_id' => $landlord->id, 'status' => MaintenanceStatus::Open]);
        MaintenanceRequest::factory()->create(['property_id' => $property->id, 'requester_id' => $landlord->id, 'status' => MaintenanceStatus::Closed]);

        Sanctum::actingAs($landlord);

        $this->assertSame([], $this->getJson('/api/maintenance-requests?filter[file]=inconnue')->assertOk()->json('data'));
        $this->assertSame([], $this->getJson('/api/maintenance-requests?filter[file][]=en_retard')->assertOk()->json('data'));

        $ids = array_column($this->getJson('/api/maintenance-requests?filter[file]=en_retard,a_dispatcher')->assertOk()->json('data'), 'id');
        sort($ids);
        $this->assertSame([$late->id, $toDispatch->id], $ids);
    }
}
