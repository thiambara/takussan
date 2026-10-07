<?php

namespace Tests\Feature\Maintenance;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Conversation;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\NotificationType;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 (verif-592, B2) — un prestataire qui n'a plus accès à l'intervention n'a plus accès à son
 * fil : ni lecture, ni écriture, ni la conversation dans sa liste, ni l'aperçu des messages par
 * notification. « Collaboration finie ou profil suspendu = plus d'accès, historique compris. »
 *
 * Il restait participant après une pause (`v08`), une suspension (`v09`) ou une fin de
 * collaboration sur une demande `completed` (`v10`), et la conversation ne relisait que la
 * participation.
 */
class MaintenanceThreadAccessTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_a_paused_provider_loses_the_thread(): void
    {
        [$mr, $provider, $agency, $conversation, $admin] = $this->threadScenario();
        $sp = ServiceProviderProfile::query()->where('user_id', $provider->id)->firstOrFail();

        Sanctum::actingAs($admin);
        $this->patchJson("/api/agencies/{$agency->id}/service-providers/{$sp->id}/collaboration", ['status' => 'paused'])->assertOk();

        $this->assertThreadClosedTo($provider, $mr, $conversation);
    }

    public function test_a_suspended_provider_loses_the_thread(): void
    {
        [$mr, $provider, , $conversation] = $this->threadScenario();
        // Latent : aucun endpoint ne pose `suspended` aujourd'hui (verif-592).
        ServiceProviderProfile::query()->where('user_id', $provider->id)
            ->update(['status' => ServiceProviderProfileStatus::Suspended->value]);

        $this->assertThreadClosedTo($provider, $mr, $conversation);
    }

    public function test_an_ended_provider_keeps_no_access_to_a_completed_request_thread(): void
    {
        [$mr, $provider, $agency, $conversation, $admin] = $this->threadScenario();
        $mr->forceFill(['status' => MaintenanceStatus::Completed, 'completed_at' => now()])->save();
        $sp = ServiceProviderProfile::query()->where('user_id', $provider->id)->firstOrFail();

        Sanctum::actingAs($admin);
        $this->patchJson("/api/agencies/{$agency->id}/service-providers/{$sp->id}/collaboration", ['status' => 'ended'])->assertOk();

        // `end()` ne désassigne pas une demande `completed` : il reste participant du fil.
        $this->assertSame($provider->id, $mr->refresh()->assigned_to);
        $this->assertThreadClosedTo($provider, $mr, $conversation);
    }

    /** Le témoin : un prestataire actif garde le fil, et les autres participants aussi. */
    public function test_an_active_provider_keeps_the_thread(): void
    {
        [, $provider, , $conversation] = $this->threadScenario();

        Sanctum::actingAs($provider);
        $this->getJson("/api/conversations/{$conversation->id}")->assertOk();
        $this->getJson("/api/conversations/{$conversation->id}/messages")->assertOk();
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Je passe demain'])->assertCreated();
        $this->assertContains($conversation->id, collect($this->getJson('/api/conversations')->assertOk()->json('data'))->pluck('id')->all());
    }

    private function assertThreadClosedTo(User $provider, MaintenanceRequest $mr, Conversation $conversation): void
    {
        // Toujours participant : c'est la policy de la demande qui ferme le fil.
        $this->assertTrue($conversation->participants()->where('users.id', $provider->id)->wherePivotNull('left_at')->exists());

        Sanctum::actingAs($provider);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertForbidden();
        $this->getJson("/api/conversations/{$conversation->id}")->assertForbidden();
        $this->getJson("/api/conversations/{$conversation->id}/messages")->assertForbidden();
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'toujours là'])->assertForbidden();
        $this->assertNotContains($conversation->id, collect($this->getJson('/api/conversations')->assertOk()->json('data'))->pluck('id')->all());

        // Un message du locataire ne lui envoie plus d'aperçu.
        $tenant = User::query()->findOrFail($mr->requester_id);
        $before = AppNotification::query()->where('user_id', $provider->id)->where('type', NotificationType::Message->value)->count();
        Sanctum::actingAs($tenant);
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Le code du portail est 1234'])->assertCreated();
        $this->assertSame($before, AppNotification::query()->where('user_id', $provider->id)->where('type', NotificationType::Message->value)->count());
    }

    /** @return array{MaintenanceRequest, User, Agency, Conversation, User} */
    private function threadScenario(): array
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $agency->forceFill(['kind' => AgencyKind::Standard])->save();
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        $provider = $this->providerFor($agency);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $provider->id])->assertOk();
        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept")->assertOk();
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'in_progress'])->assertOk();

        $conversation = Conversation::query()->where('maintenance_request_id', $mr->id)->sole();

        return [$mr->refresh(), $provider, $agency, $conversation, $admin];
    }
}
