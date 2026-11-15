<?php

namespace Tests\Feature\Messaging;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\NotifyNewMessageJob;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\ConversationType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Lease;
use App\Models\Message;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Messaging\ConversationAccess;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2782 — une seule règle d'écriture : le message initial d'une directe (reprise ou neuve) et d'un groupe
 * est jugé par `ConversationAccess::allowsWriting`, comme un envoi (`POST /api/conversations/{id}/messages`),
 * par `ConversationWriter`.
 *
 * AC1 (amendé le 2026-11-13) — la propriété se prouve par un DOUBLE de `ConversationAccess` lié dans le
 * conteneur, dont `allowsWriting` refuse les fils choisis : « toute règle de `allowsWriting` s'applique au
 * message initial », sur les trois chemins. Aucun état atteignable ne l'exerce aujourd'hui : le bailleur parti
 * ou suspendu est arrêté à la validation (422, `guardContext`), et un fil d'intervention est un groupe, jamais
 * repris par `DirectConversationService`. Ces deux-là restent témoins (422, rien d'écrit).
 *
 * Fixture : une agence, son agent, le bailleur L, un locataire T et sa fiche, un bien et son bail actif, une
 * directe de BAIL entre L et l'agent (la reprise), et deux directes simples (L est en relation avec l'agent et
 * avec T : les gardes de création passent).
 */
class MessageInitialRegleDEcritureTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $landlord;

    private User $tenant;

    private OwnerProfile $profile;

    private Property $bien;

    private Lease $bail;

    private Conversation $fil;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Queue::fake();
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard, 'commission_rate' => 8, 'is_verified' => true]);
        $this->agent = $this->agencyAgent($this->agency);
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create(['phone_verified_at' => now()]);
        $this->profile = OwnerProfile::query()->where('user_id', $this->landlord->id)->firstOrFail();
        $this->tenant = User::factory()->create();
        $fiche = Customer::factory()->create(['user_id' => $this->tenant->id, 'agency_id' => $this->agency->id]);
        $this->bien = Property::factory()->published()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
        $this->bail = Lease::factory()->create([
            'property_id' => $this->bien->id, 'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id,
            'tenant_id' => $fiche->id, 'status' => LeaseStatus::Active, 'commission_rate' => 10,
        ]);
        $this->fil = $this->directe($this->landlord, $this->agent, $this->bail->id);
        $this->fil->forceFill(['last_message_at' => now()->subDay(), 'last_message_preview' => 'avant'])->save();
        $this->directe($this->landlord, $this->agent);
        $this->directe($this->landlord, $this->tenant);
        $this->asUser($this->landlord);
    }

    private function directe(User $a, User $b, ?int $leaseId = null): Conversation
    {
        $c = Conversation::factory()->create(['created_by' => $a->id, 'type' => ConversationType::Direct, 'lease_id' => $leaseId]);
        $c->participants()->attach($a->id, ['joined_at' => now()]);
        $c->participants()->attach($b->id, ['joined_at' => now()]);

        return $c;
    }

    private function asUser(User $u): void
    {
        $this->app['auth']->forgetGuards();
        $this->actingAs($u->fresh(), 'sanctum');
    }

    /** Le double : `allowsWriting` refuse tout fil que `$refuse` désigne, et juge les autres comme le vrai. */
    private function refuserLEcriture(Closure $refuse): void
    {
        $this->app->instance(ConversationAccess::class, new class($refuse) extends ConversationAccess
        {
            public function __construct(private readonly Closure $refuse) {}

            public function allowsWriting(User $user, Conversation $conversation): bool
            {
                return ! ($this->refuse)($conversation) && parent::allowsWriting($user, $conversation);
            }
        });
    }

    private function reprise(string $message = 'Bonjour'): TestResponse
    {
        return $this->postJson('/api/conversations', ['participants' => [$this->agent->id], 'lease_id' => $this->bail->id, 'initial_message' => $message]);
    }

    private function directeNeuve(): TestResponse
    {
        return $this->postJson('/api/conversations', ['participants' => [$this->tenant->id], 'lease_id' => $this->bail->id, 'initial_message' => 'Bonjour']);
    }

    private function groupe(): TestResponse
    {
        return $this->postJson('/api/conversations', [
            'type' => 'group', 'subject' => 'G', 'participants' => [$this->agent->id, $this->tenant->id],
            'lease_id' => $this->bail->id, 'initial_message' => 'Bonjour à tous',
        ]);
    }

    /** @return array{int, int, int, int} fils, participations, messages, avis d'invitation */
    private function etat(): array
    {
        return [
            Conversation::query()->count(),
            DB::table('conversation_participants')->count(),
            Message::query()->count(),
            AppNotification::query()->where('code', NotificationCode::MessageGroupInvite->value)->count(),
        ];
    }

    private function assertRienNEstParti(): void
    {
        Queue::assertNotPushed(NotifyNewMessageJob::class);
        Notification::assertNothingSent();
    }

    public function test_ac1_la_directe_reprise_suit_l_envoi_403_avec_le_meme_corps_et_rien_n_est_ecrit(): void
    {
        $this->refuserLEcriture(fn (Conversation $c) => $c->id === $this->fil->id);
        $avant = $this->etat();
        $pointeur = $this->fil->fresh()->only(['last_message_id', 'last_message_preview', 'last_message_at']);

        $envoi = $this->postJson("/api/conversations/{$this->fil->id}/messages", ['content' => 'Bonjour'])->assertForbidden();
        $initial = $this->reprise()->assertForbidden();

        $this->assertSame($envoi->json(), $initial->json(), 'le corps du refus est celui de l’envoi');
        $this->assertSame('http.forbidden', $initial->json('code'));
        $this->assertSame($avant, $this->etat(), 'ni fil, ni participant, ni message, ni invitation');
        $this->assertEquals($pointeur, $this->fil->fresh()->only(['last_message_id', 'last_message_preview', 'last_message_at']));
        $this->assertRienNEstParti();
    }

    public function test_ac1_une_directe_neuve_refusee_n_est_pas_creee(): void
    {
        $this->refuserLEcriture(fn (Conversation $c) => (int) $c->lease_id === $this->bail->id);
        $avant = $this->etat();

        $this->directeNeuve()->assertForbidden()->assertJsonPath('code', 'http.forbidden');

        $this->assertSame($avant, $this->etat(), 'aucune directe neuve, aucun message');
        $this->assertRienNEstParti();
    }

    public function test_ac1_un_groupe_refuse_ne_laisse_ni_groupe_vide_ni_invitation(): void
    {
        $this->refuserLEcriture(fn (Conversation $c) => $c->type === ConversationType::Group);
        $avant = $this->etat();

        $this->groupe()->assertForbidden()->assertJsonPath('code', 'http.forbidden');

        $this->assertSame($avant, $this->etat(), 'aucun groupe, aucun membre, aucun message, aucun avis d’invitation');
        $this->assertSame(0, Conversation::query()->where('type', ConversationType::Group->value)->count());
        $this->assertRienNEstParti();
    }

    public function test_temoins_le_bailleur_suspendu_et_le_parti_sont_arretes_a_la_validation_et_rien_n_est_ecrit(): void
    {
        foreach ([OwnerProfileStatus::Blocked, OwnerProfileStatus::Inactive] as $statut) {
            $this->profile->forceFill(['status' => $statut])->save();
            $this->asUser($this->landlord);
            $avant = $this->etat();

            $this->postJson("/api/conversations/{$this->fil->id}/messages", ['content' => 'Bonjour'])->assertForbidden();
            $this->reprise()->assertStatus(422)->assertJsonValidationErrors('lease_id');
            $this->directeNeuve()->assertStatus(422)->assertJsonValidationErrors('lease_id');
            $this->groupe()->assertStatus(422)->assertJsonValidationErrors('lease_id');

            $this->assertSame($avant, $this->etat(), "{$statut->value} : rien d’écrit");
        }
        $this->assertRienNEstParti();
    }

    public function test_ac2_la_directe_reprise_permise_rend_200_et_se_comporte_comme_un_envoi(): void
    {
        DB::table('conversation_participants')->where('conversation_id', $this->fil->id)
            ->update(['archived_at' => now()->subHour(), 'last_read_at' => null]);

        $this->reprise('Le loyer de novembre')->assertOk()->assertJsonPath('data.id', $this->fil->id);

        $message = Message::query()->where('conversation_id', $this->fil->id)->sole();
        $this->assertSame($this->landlord->id, $message->sender_id);
        $this->assertSame($message->id, $this->fil->fresh()->last_message_id);
        $this->assertSame('Le loyer de novembre', $this->fil->fresh()->last_message_preview);
        // Effet de bord voulu (accord de team-lead du 2026-11-13) : l'auteur a lu son propre message, et le fil
        // se désarchive pour tous, comme après un envoi.
        $pivots = DB::table('conversation_participants')->where('conversation_id', $this->fil->id)->get()->keyBy('user_id');
        $this->assertNotNull($pivots[$this->landlord->id]->last_read_at);
        $this->assertNull($pivots[$this->landlord->id]->archived_at);
        $this->assertNull($pivots[$this->agent->id]->archived_at);
        Queue::assertPushed(NotifyNewMessageJob::class, fn (NotifyNewMessageJob $job) => $job->messageId === $message->id);
    }

    public function test_ac2_la_directe_neuve_rend_201_avec_son_message(): void
    {
        $reponse = $this->directeNeuve()->assertCreated();

        $neuve = Conversation::query()->findOrFail($reponse->json('data.id'));
        $message = Message::query()->where('conversation_id', $neuve->id)->sole();
        $this->assertSame('Bonjour', $message->content);
        $this->assertSame($message->id, $neuve->last_message_id);
        Queue::assertPushed(NotifyNewMessageJob::class, 1);
    }

    public function test_ac3_le_groupe_cree_avec_son_message_rend_201_notifie_et_invite(): void
    {
        $reponse = $this->groupe()->assertCreated();

        $groupe = Conversation::query()->findOrFail($reponse->json('data.id'));
        $message = Message::query()->where('conversation_id', $groupe->id)->where('sender_id', $this->landlord->id)->sole();
        $this->assertSame($message->id, $groupe->last_message_id);
        Queue::assertPushed(NotifyNewMessageJob::class, fn (NotifyNewMessageJob $job) => $job->messageId === $message->id);
        Notification::assertSentTo([$this->agent, $this->tenant], CodedNotification::class);
        $this->assertSame(2, AppNotification::query()->where('code', NotificationCode::MessageGroupInvite->value)->count());
    }

    public function test_ac4_le_bailleur_suspendu_ecrit_toujours_a_sa_propre_annonce_par_le_contact_public(): void
    {
        PropertyCollaborator::create([
            'property_id' => $this->bien->id, 'user_id' => $this->agent->id,
            'role' => CollaboratorRole::Agent->value, 'accepted_at' => now(),
        ]);
        $this->profile->forceFill(['status' => OwnerProfileStatus::Blocked])->save();
        $this->asUser($this->landlord);

        $reponse = $this->postJson("/api/public/properties/{$this->bien->slug}/contact-message", ['message' => 'Une question sur mon annonce'])
            ->assertCreated();

        // Décision y q2 du 2026-11-13 : la porte du visiteur, hors de `allowsWriting`.
        $this->assertDatabaseHas('messages', [
            'conversation_id' => $reponse->json('data.conversation_id'),
            'sender_id' => $this->landlord->id,
            'content' => 'Une question sur mon annonce',
        ]);
    }
}
