<?php

namespace Tests\Feature\Api;

use App\Jobs\Inventory\SendSignedInventoryPdf;
use App\Models\Activity;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Model\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2913 (ADR-0098, amendement B) — à la seconde signature, une tâche en file avise le locataire et
 * le bailleur que le PDF signé se télécharge depuis la fiche ; une seule fois par état des lieux ; la
 * ressource rend `pdf_sent_at` et les destinataires ; le journal porte l'envoi.
 */
class InventorySignedPdfDispatchTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';

    private User $owner;

    private User $tenantUser;

    private Inventory $inventory;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = Agency::factory()->create();
        $this->owner = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $agency->id, 'title' => 'Villa Mermoz']);
        $this->tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $this->tenantUser->id]);
        $this->lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $this->owner->id,
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->id,
        ]);
        $this->inventory = Inventory::factory()->create([
            'lease_id' => $this->lease->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $this->agencyAgent($agency)->id,
        ]);
    }

    private function sign(User $as, string $role): TestResponse
    {
        Sanctum::actingAs($as);

        return $this->postJson("/api/inventories/{$this->inventory->id}/sign", ['role' => $role, 'signature' => self::SIGNATURE]);
    }

    private function codes(): array
    {
        return AppNotification::query()->where('code', 'inventory.signed_pdf_available')->orderBy('user_id')->pluck('user_id')->all();
    }

    public function test_ac2_la_premiere_signature_ne_met_rien_en_file(): void
    {
        Queue::fake();

        $this->sign($this->tenantUser, 'tenant')->assertOk();

        Queue::assertNotPushed(SendSignedInventoryPdf::class);
    }

    public function test_ac1_la_seconde_signature_met_l_envoi_en_file(): void
    {
        Queue::fake();

        $this->sign($this->tenantUser, 'tenant')->assertOk();
        $this->sign($this->owner, 'landlord')->assertOk()->assertJsonPath('data.status', 'signed');

        Queue::assertPushed(SendSignedInventoryPdf::class, 1);
        Queue::assertPushed(SendSignedInventoryPdf::class, fn (SendSignedInventoryPdf $job) => $job->inventoryId === $this->inventory->id);
        // La réponse de la signature n'a rien attendu : rien n'est encore parti.
        $this->assertNull($this->inventory->refresh()->pdf_sent_at);
    }

    public function test_ac1_ac5_a_l_execution_les_deux_parties_sont_avisees_la_ressource_et_le_journal_le_disent(): void
    {
        Notification::fake();

        $this->sign($this->owner, 'landlord')->assertOk();
        $this->sign($this->tenantUser, 'tenant')->assertOk();

        $ids = [$this->owner->id, $this->tenantUser->id];
        sort($ids);
        $this->assertSame($ids, $this->codes());
        foreach ([$this->owner, $this->tenantUser] as $user) {
            Notification::assertSentTo($user, CodedNotification::class, function (CodedNotification $n, array $channels) use ($user) {
                $mail = $n->toMail($user);

                return $n->code->value === 'inventory.signed_pdf_available'
                    && $n->target['path'] === "/app/inventories/{$this->inventory->id}"
                    && in_array('mail', $channels, true)
                    && str_ends_with((string) $mail->actionUrl, "/app/inventories/{$this->inventory->id}");
            });
        }

        $row = $this->inventory->refresh();
        $this->assertNotNull($row->pdf_sent_at);
        $this->assertEqualsCanonicalizing($ids, $row->pdf_sent_to);

        Sanctum::actingAs($this->tenantUser);
        $response = $this->getJson("/api/inventories/{$this->inventory->id}")->assertOk();
        $this->assertNotNull($response->json('data.pdf_sent_at'));
        $this->assertEqualsCanonicalizing($ids, array_column($response->json('data.pdf_sent_to'), 'id'));

        $journal = Activity::query()
            ->where('event', SendSignedInventoryPdf::EVENT)
            ->where('subject_type', $this->inventory->getMorphClass())
            ->where('subject_id', $this->inventory->id)
            ->sole();
        $this->assertEqualsCanonicalizing($ids, $journal->properties['recipient_ids']);
    }

    public function test_ac2_rejouer_la_tache_ne_produit_pas_de_second_envoi(): void
    {
        Notification::fake();

        $this->sign($this->owner, 'landlord')->assertOk();
        $this->sign($this->tenantUser, 'tenant')->assertOk();
        $this->assertCount(2, $this->codes());

        (new SendSignedInventoryPdf($this->inventory->id))->handle(app(NotificationService::class));
        dispatch(new SendSignedInventoryPdf($this->inventory->id));

        $this->assertCount(2, $this->codes());
        Notification::assertSentToTimes($this->owner, CodedNotification::class, 1);
        $this->assertSame(1, Activity::query()->where('event', SendSignedInventoryPdf::EVENT)->count());
    }

    public function test_un_etat_des_lieux_non_signe_n_envoie_rien(): void
    {
        Notification::fake();

        (new SendSignedInventoryPdf($this->inventory->id))->handle(app(NotificationService::class));

        $this->assertSame([], $this->codes());
        $this->assertNull($this->inventory->refresh()->pdf_sent_at);
    }

    public function test_un_locataire_sans_compte_n_est_pas_destinataire(): void
    {
        Notification::fake();
        // Le bailleur signe ; le locataire a signé depuis son compte, puis sa fiche a perdu le compte.
        $this->sign($this->tenantUser, 'tenant')->assertOk();
        Customer::query()->whereKey($this->lease->tenant_id)->update(['user_id' => null]);
        $this->sign($this->owner, 'landlord')->assertOk();

        $this->assertSame([$this->owner->id], $this->codes());
        $this->assertSame([$this->owner->id], $this->inventory->refresh()->pdf_sent_to);
    }
}
