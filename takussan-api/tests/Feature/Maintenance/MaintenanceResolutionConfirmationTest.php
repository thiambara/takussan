<?php

namespace Tests\Feature\Maintenance;

use App\Models\AppNotification;
use App\Models\Enums\MaintenanceStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC12 (P10), première moitié : le demandeur confirme ou conteste la réparation.
 *
 * Le prestataire passait lui-même `completed → closed` : celui qui a fait le travail en prononçait
 * la réception.
 */
class MaintenanceResolutionConfirmationTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_requester_confirms_and_the_request_closes(): void
    {
        ['mr' => $mr, 'tenant' => $tenant, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now()]);

        Sanctum::actingAs($tenant);
        $this->postJson("/api/maintenance-requests/{$mr->id}/confirm-resolution")->assertOk()->assertJsonPath('data.status', 'closed');

        $this->assertSame(MaintenanceStatus::Closed, $mr->refresh()->status);
        $this->assertSame(
            [__('maintenance.notifications.confirmed.title', ['title' => $mr->title], 'fr')],
            AppNotification::query()->where('user_id', $provider->id)->pluck('title')->all(),
        );
    }

    public function test_requester_contests_and_provider_and_principal_are_told(): void
    {
        Storage::fake(config('media-library.disk_name'));
        Storage::fake('private');
        ['mr' => $mr, 'tenant' => $tenant, 'provider' => $provider, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now()]);

        Sanctum::actingAs($tenant);
        $this->post("/api/maintenance-requests/{$mr->id}/contest-resolution", [
            'comment' => 'La fuite a repris ce matin',
            'photos' => [UploadedFile::fake()->image('fuite.jpg')],
        ], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.status', 'in_progress');

        $mr->refresh();
        $this->assertSame(MaintenanceStatus::InProgress, $mr->status);
        $this->assertNull($mr->completed_at);
        $this->assertSame($provider->id, $mr->assigned_to);
        $this->assertCount(1, $mr->getMedia('photos'));

        foreach ([$provider, $landlord] as $told) {
            $this->assertStringContainsString(
                'La fuite a repris ce matin',
                AppNotification::query()->where('user_id', $told->id)->sole()->body,
            );
        }
    }

    public function test_contest_requires_a_comment(): void
    {
        ['mr' => $mr, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Completed);

        Sanctum::actingAs($tenant);
        $this->postJson("/api/maintenance-requests/{$mr->id}/contest-resolution", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('comment');
    }

    /** Le prestataire ne prononce pas la réception de son propre travail. */
    public function test_provider_neither_confirms_nor_contests(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Completed);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/confirm-resolution")->assertForbidden();
        $this->postJson("/api/maintenance-requests/{$mr->id}/contest-resolution", ['comment' => 'Pas fini'])->assertForbidden();

        $this->assertSame(MaintenanceStatus::Completed, $mr->refresh()->status);
    }

    /** Témoin et contrat : le donneur d'ordre (ici le bailleur du bien) peut aussi confirmer. */
    public function test_principal_may_confirm(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Completed);

        Sanctum::actingAs($landlord);
        $this->postJson("/api/maintenance-requests/{$mr->id}/confirm-resolution")->assertOk();

        $this->assertSame(MaintenanceStatus::Closed, $mr->refresh()->status);
    }

    /** Un autre bailleur de l'agence n'est pas donneur d'ordre de ce bien. */
    public function test_another_landlord_cannot_confirm(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Completed);

        Sanctum::actingAs($this->landlordOf($agency));
        $this->postJson("/api/maintenance-requests/{$mr->id}/confirm-resolution")->assertForbidden();
    }

    /** Hors de `completed`, il n'y a rien à confirmer. */
    public function test_nothing_to_confirm_before_completion(): void
    {
        ['mr' => $mr, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::InProgress);

        Sanctum::actingAs($tenant);
        $this->postJson("/api/maintenance-requests/{$mr->id}/confirm-resolution")->assertForbidden();

        $this->assertSame(MaintenanceStatus::InProgress, $mr->refresh()->status);
    }
}
