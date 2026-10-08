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
use App\Models\Message;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use App\Services\Privacy\DataExportBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
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

    /**
     * Passe 2 (N1, sondes p03 et p13) — la recherche de messages lisait la seule participation :
     * le prestataire en pause y retrouvait le texte du locataire et l'URL signée de sa note vocale.
     */
    public function test_a_paused_provider_finds_nothing_of_the_thread_through_search(): void
    {
        config(['scout.driver' => 'collection']);
        Storage::fake('local');
        [$mr, $provider, $agency, $conversation, $admin] = $this->threadScenario();
        $tenant = User::query()->findOrFail($mr->requester_id);

        Sanctum::actingAs($tenant);
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'code portail 4512 et digicode'])->assertCreated();
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['type' => 'audio', 'duration' => 4,
            'audio' => UploadedFile::fake()->createWithContent('n.webm', "\x1A\x45\xDF\xA3".str_repeat("\0", 200))])->assertCreated();
        $voiceWord = collect(explode(' ', (string) Message::query()->where('conversation_id', $conversation->id)->latest('id')->value('content')))
            ->sortByDesc(fn (string $w) => mb_strlen($w))->first();

        // Témoin : actif, il trouve les deux, l'URL de la note comprise.
        Sanctum::actingAs($provider);
        $this->assertSame(['code portail 4512 et digicode'], $this->searchContents('portail'));
        $this->assertNotNull($this->searchAudioUrl($voiceWord));

        $this->pause($agency, $provider, $admin);

        Sanctum::actingAs($provider);
        $this->assertSame([], $this->searchContents('portail'));
        $this->assertSame([], $this->searchContents($voiceWord));
        $this->assertNull($this->searchAudioUrl($voiceWord));
    }

    /** Passe 2 (N1) — l'export de ses données garde SES messages, plus ceux d'un fil fermé. */
    public function test_a_paused_provider_exports_only_their_own_thread_messages(): void
    {
        [$mr, $provider, $agency, $conversation, $admin] = $this->threadScenario();
        $tenant = User::query()->findOrFail($mr->requester_id);

        Sanctum::actingAs($provider);
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Je passe demain'])->assertCreated();
        Sanctum::actingAs($tenant);
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'code portail 4512'])->assertCreated();

        $exported = fn () => collect(app(DataExportBuilder::class)->payloads($provider->refresh())['messages.json'])->pluck('content')->all();
        $this->assertContains('code portail 4512', $exported());

        $this->pause($agency, $provider, $admin);

        $this->assertContains('Je passe demain', $exported());
        $this->assertNotContains('code portail 4512', $exported());
    }

    /** Passe 2 (N1) — un fil fermé ne garde pas le locataire dans ses correspondants. */
    public function test_a_paused_provider_no_longer_reaches_the_tenant_through_the_thread(): void
    {
        [$mr, $provider, $agency, , $admin] = $this->threadScenario();

        Sanctum::actingAs($provider);
        $this->assertContains($mr->requester_id, $this->contactIds());

        $this->pause($agency, $provider, $admin);

        Sanctum::actingAs($provider);
        $this->assertNotContains($mr->requester_id, $this->contactIds());
    }

    private function pause(Agency $agency, User $provider, User $admin): void
    {
        $sp = ServiceProviderProfile::query()->where('user_id', $provider->id)->firstOrFail();
        Sanctum::actingAs($admin);
        $this->patchJson("/api/agencies/{$agency->id}/service-providers/{$sp->id}/collaboration", ['status' => 'paused'])->assertOk();
    }

    /** @return list<string> */
    private function searchContents(string $q): array
    {
        return collect($this->getJson('/api/search/messages?q='.urlencode($q))->assertOk()->json('data'))->pluck('content')->all();
    }

    private function searchAudioUrl(string $q): ?string
    {
        return collect($this->getJson('/api/search/messages?q='.urlencode($q))->assertOk()->json('data'))
            ->pluck('attachments')->flatten(1)->pluck('url')->first();
    }

    /** @return list<int> */
    private function contactIds(): array
    {
        return collect($this->getJson('/api/conversations/contacts?per_page=100')->assertOk()->json('data'))->pluck('id')->map(fn ($id) => (int) $id)->all();
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
