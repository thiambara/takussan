<?php

namespace Tests\Feature\Messaging;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Models\Enums\ParticipantRole;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\User;
use App\Services\Messaging\EvenementsDuFil;
use App\Services\Privacy\DataExportBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2958 (ADR-0128 § 5, AC7) — un message `event` ne compte comme non lu pour PERSONNE (sans auteur,
 * il compterait chez tous jusqu'à TCK-2959 et son `action_for`) ; une `card` compte comme un message
 * d'un autre. Les deux définitions : `$nonLus` (la liste) et sa copie dans `markAsUnread`.
 *
 * TCK-2959 (ADR-0128 § 5) — un `event` compte comme non lu pour qui figure dans son `action_for`, et
 * pour lui seul ; la définition est unique (`NonLus`), appelée par la liste et par `markAsUnread`. Les
 * trois tests ci-dessus restent les cas « sans `action_for` ». La liste `action_for` ne sort jamais :
 * ni par le fil, ni par la liste, ni par l'archive ; le lecteur reçoit son booléen `action_attendue`.
 */
class NonLusDesEvenementsTest extends TestCase
{
    use RefreshDatabase;

    private User $lecteur;

    private User $autre;

    private Conversation $fil;

    protected function setUp(): void
    {
        parent::setUp();

        $this->lecteur = User::factory()->create();
        $this->autre = User::factory()->create();
        $this->fil = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Intervention',
            'created_by' => $this->autre->id,
        ]);
        $this->fil->participants()->attach($this->autre->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $this->fil->participants()->attach($this->lecteur->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now(), 'last_read_at' => now()->subDay()]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /** @param  list<User|int>  $actionFor  TCK-2959 */
    private function evenement(array $actionFor = []): Message
    {
        return app(EvenementsDuFil::class)->ecrire($this->fil, MaintenanceRequest::factory()->create(), 'maintenance.transition', ['status' => 'in_progress'], $actionFor);
    }

    private function message(MessageType $type): Message
    {
        return Message::create([
            'conversation_id' => $this->fil->id,
            'sender_id' => $this->autre->id,
            'type' => $type->value,
            'content' => $type === MessageType::Card ? 'test.card' : 'Bonjour',
            'metadata' => $type === MessageType::Card ? ['object' => ['type' => 'lease', 'id' => 1], 'code' => 'test.card', 'data' => []] : null,
        ]);
    }

    /** @return array{unread_count: int, unread_total: int} */
    private function compte(): array
    {
        Sanctum::actingAs($this->lecteur);
        $reponse = $this->getJson('/api/conversations')->assertOk();

        return [
            'unread_count' => (int) $reponse->json('data.0.unread_count'),
            'unread_total' => (int) $reponse->json('meta.unread_total'),
        ];
    }

    public function test_un_evenement_ne_compte_pas_dans_la_liste(): void
    {
        $this->evenement();
        $this->evenement();

        $this->assertSame(['unread_count' => 0, 'unread_total' => 0], $this->compte());
    }

    public function test_une_carte_d_un_autre_compte_dans_la_liste(): void
    {
        $this->evenement();
        $this->message(MessageType::Card);

        $this->assertSame(['unread_count' => 1, 'unread_total' => 1], $this->compte());
    }

    /** `markAsUnread` recule la lecture avant le dernier message QUI COMPTE : pas avant un événement plus récent. */
    public function test_marquer_non_lu_ignore_l_evenement(): void
    {
        Carbon::setTestNow('2026-11-18 10:00:00');
        $this->message(MessageType::Text);
        Carbon::setTestNow('2026-11-18 10:05:00');
        $this->evenement();
        Carbon::setTestNow('2026-11-18 10:10:00');
        $this->fil->participants()->updateExistingPivot($this->lecteur->id, ['last_read_at' => now()]);

        Sanctum::actingAs($this->lecteur);
        $this->putJson("/api/conversations/{$this->fil->id}/unread")->assertOk();

        $lecture = $this->fil->participants()->where('users.id', $this->lecteur->id)->first()->pivot->last_read_at;
        $this->assertSame('2026-11-18 09:59:59', Carbon::parse($lecture)->format('Y-m-d H:i:s'));
    }

    // ── TCK-2959 ────────────────────────────────────────────────────────────────────────────────

    /**
     * Les quatre lectures du compte de `GET /api/conversations` pour `$qui` : le fil, le total de la
     * pastille, la puce « Non lus » et le filtre `filter[unread]`.
     *
     * @return array{unread_count: int, unread_total: int, counts_unread: int, filtre: int}
     */
    private function comptesDe(User $qui): array
    {
        Sanctum::actingAs($qui);
        $liste = $this->getJson('/api/conversations')->assertOk();
        $filtre = $this->getJson('/api/conversations?filter[unread]=1')->assertOk();
        $this->assertSame($this->fil->id, $liste->json('data.0.id'));

        return [
            'unread_count' => (int) $liste->json('data.0.unread_count'),
            'unread_total' => (int) $liste->json('meta.unread_total'),
            'counts_unread' => (int) $liste->json('meta.counts.unread'),
            'filtre' => count($filtre->json('data')),
        ];
    }

    private const UN = ['unread_count' => 1, 'unread_total' => 1, 'counts_unread' => 1, 'filtre' => 1];

    private const ZERO = ['unread_count' => 0, 'unread_total' => 0, 'counts_unread' => 0, 'filtre' => 0];

    /** AC1 — le même `event` : non lu pour le participant visé, lu pour l'autre (dont `last_read_at` est nul). */
    public function test_un_evenement_compte_pour_qui_doit_agir_et_pour_lui_seul(): void
    {
        $this->evenement([$this->lecteur]);

        $this->assertSame(self::UN, $this->comptesDe($this->lecteur));
        $this->assertSame(self::ZERO, $this->comptesDe($this->autre));
    }

    /** Un `event` écrit avant TCK-2959 (converti par TCK-2958) n'a pas la clé : il ne compte pour personne. */
    public function test_un_evenement_sans_cle_action_for_ne_compte_pour_personne(): void
    {
        Message::create([
            'conversation_id' => $this->fil->id,
            'sender_id' => null,
            'type' => MessageType::Event->value,
            'content' => 'maintenance.transition',
            'metadata' => ['object' => ['type' => 'maintenance_request', 'id' => 1], 'code' => 'maintenance.transition', 'data' => []],
        ]);
        $this->evenement();

        $this->assertSame(self::ZERO, $this->comptesDe($this->lecteur));
        $this->assertSame(self::ZERO, $this->comptesDe($this->autre));
    }

    /** AC1, AC2 — `markAsUnread` suit la même définition : il recule avant l'événement pour le visé, ne bouge rien pour l'autre. */
    public function test_marquer_non_lu_suit_action_for(): void
    {
        Carbon::setTestNow('2026-11-18 10:05:00');
        $this->evenement([$this->lecteur]);
        Carbon::setTestNow('2026-11-18 10:10:00');
        $this->fil->participants()->updateExistingPivot($this->lecteur->id, ['last_read_at' => now()]);
        $this->fil->participants()->updateExistingPivot($this->autre->id, ['last_read_at' => now()]);

        $lecture = fn (User $qui) => Carbon::parse($this->fil->participants()->where('users.id', $qui->id)->first()->pivot->last_read_at)->format('Y-m-d H:i:s');

        Sanctum::actingAs($this->lecteur);
        $this->putJson("/api/conversations/{$this->fil->id}/unread")->assertOk();
        $this->assertSame('2026-11-18 10:04:59', $lecture($this->lecteur));

        Sanctum::actingAs($this->autre);
        $this->putJson("/api/conversations/{$this->fil->id}/unread")->assertOk();
        $this->assertSame('2026-11-18 10:10:00', $lecture($this->autre));
    }

    /** `action_for` ne garde que les participants ACTIFS, en entiers uniques : ni étranger au fil, ni parti. */
    public function test_action_for_est_filtre_sur_les_participants_actifs(): void
    {
        $etranger = User::factory()->create();
        $parti = User::factory()->create();
        $this->fil->participants()->attach($parti->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now(), 'left_at' => now()]);

        $message = $this->evenement([$etranger, $parti, $this->lecteur, $this->lecteur->id, (string) $this->autre->id]);

        $attendu = [$this->lecteur->id, $this->autre->id];
        sort($attendu);
        $this->assertSame($attendu, $message->metadata['action_for']);
        // Des NOMBRES en `jsonb` : `@>` ne trouverait pas `5` dans `["5"]`.
        $types = DB::table('messages')->where('id', $message->id)
            ->selectRaw("(select array_agg(distinct jsonb_typeof(e)) from jsonb_array_elements(metadata->'action_for') e) as types")
            ->value('types');
        $this->assertSame('{number}', $types);
    }

    /** AC3 — la liste `action_for` ne sort ni par le fil, ni par la liste, ni par l'archive ; le lecteur reçoit son booléen. */
    public function test_la_liste_action_for_ne_sort_jamais(): void
    {
        $this->evenement([$this->lecteur]);

        Sanctum::actingAs($this->lecteur);
        $fil = $this->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk();
        $this->assertSame('event', $fil->json('data.0.type'));
        $this->assertSame('maintenance.transition', $fil->json('data.0.metadata.code'));
        $this->assertArrayNotHasKey('action_for', $fil->json('data.0.metadata'));
        $this->assertTrue($fil->json('data.0.action_attendue'));

        $liste = $this->getJson('/api/conversations')->assertOk();
        $this->assertSame('maintenance.transition', $liste->json('data.0.last_message.metadata.code'));
        $this->assertArrayNotHasKey('action_for', $liste->json('data.0.last_message.metadata'));

        Sanctum::actingAs($this->autre);
        $this->assertFalse($this->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk()->json('data.0.action_attendue'));

        $archive = collect(app(DataExportBuilder::class)->payloads($this->autre)['messages.json'])->firstWhere('type', 'event');
        $this->assertSame('maintenance.transition', $archive['metadata']['code']);
        $this->assertArrayNotHasKey('action_for', $archive['metadata']);
    }

    /** Une carte ou un texte ne portent pas le booléen : il ne vaut que pour un événement. */
    public function test_le_booleen_n_existe_que_pour_un_evenement(): void
    {
        $this->message(MessageType::Text);

        Sanctum::actingAs($this->lecteur);
        $this->assertArrayNotHasKey('action_attendue', $this->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk()->json('data.0'));
    }

    /**
     * Le curseur de lecture vaut pour un `event` comme pour tout message, et la règle de `NonLus` reste
     * DANS son fil : l'événement d'un fil ne compte pas dans un autre où le même lecteur n'a rien de non lu.
     */
    public function test_un_evenement_lu_ne_compte_plus_et_ne_deborde_pas_sur_un_autre_fil(): void
    {
        $second = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Autre fil',
            'created_by' => $this->autre->id,
        ]);
        $second->participants()->attach($this->autre->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $second->participants()->attach($this->lecteur->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now(), 'last_read_at' => now()->subDay()]);
        Carbon::setTestNow(now()->addMinute());
        $this->evenement([$this->lecteur]);

        Sanctum::actingAs($this->lecteur);
        $liste = collect($this->getJson('/api/conversations')->assertOk()->json('data'))->keyBy('id');
        $this->assertSame(1, $liste[$this->fil->id]['unread_count']);
        $this->assertSame(0, $liste[$second->id]['unread_count']);
        $this->assertSame([$this->fil->id], array_column($this->getJson('/api/conversations?filter[unread]=1')->assertOk()->json('data'), 'id'));

        // `markAsUnread` du second fil ne voit pas l'événement du premier : sa lecture ne recule pas.
        // (`whereHas` et `withCount` groupent d'eux-mêmes le `or` d'un rappel ; `Message::query()->tap()` non.)
        $second->participants()->updateExistingPivot($this->lecteur->id, ['last_read_at' => now()]);
        $this->putJson("/api/conversations/{$second->id}/unread")->assertOk();
        $this->assertSame(now()->format('Y-m-d H:i:s'), Carbon::parse($second->participants()->where('users.id', $this->lecteur->id)->first()->pivot->last_read_at)->format('Y-m-d H:i:s'));

        Carbon::setTestNow(now()->addMinute());
        $this->putJson("/api/conversations/{$this->fil->id}/read")->assertOk();

        $reponse = $this->getJson('/api/conversations')->assertOk();
        $this->assertSame([0, 0], collect($reponse->json('data'))->pluck('unread_count')->all());
        $this->assertSame(0, $reponse->json('meta.unread_total'));
        $this->assertSame(0, $reponse->json('meta.counts.unread'));
        $this->assertSame([], $this->getJson('/api/conversations?filter[unread]=1')->assertOk()->json('data'));
    }
}
