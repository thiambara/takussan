<?php

namespace Tests\Feature\Messaging\Mentions;

use App\Domain\Notifications\NotificationCode;
use App\Exceptions\ApiError;
use App\Jobs\NotifyNewMessageJob;
use App\Models\AppNotification;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Messaging\ConversationWriter;
use App\Services\Model\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\ApiTestCase;
use Tests\Support\SceneDeNoteDEquipe;

/**
 * TCK-2966 (ADR-0128 § 6, dernier point) — les @mentions d'un fil : `metadata.mentions`, refusées en 422
 * vers qui ne lit pas le message, notifiées par `message.mention` à qui le lit (sourdine comprise), et
 * jamais à qui a quitté le fil ou l'agence entre l'envoi et le job.
 *
 * La scène est celle de la note d'équipe (TCK-2965) : l'auteur et le collègue lisent les notes ; le
 * locataire, le bailleur et l'agent d'une autre agence ne les lisent pas.
 */
class MentionsDuFilTest extends ApiTestCase
{
    use RefreshDatabase, SceneDeNoteDEquipe;

    /** @var list<array{int, string}> [destinataire, code] de chaque envoi du job */
    private array $envois = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
    }

    // ── Forme ────────────────────────────────────────────────────────────────────────────────────────

    public function test_la_route_range_les_mentions_dedoublonnees_et_triees(): void
    {
        Queue::fake();
        Sanctum::actingAs($this->auteur);
        $mentions = [$this->locataire->id, $this->collegue->id, $this->locataire->id];

        $id = $this->postJson("/api/conversations/{$this->fil->id}/messages", [
            'content' => 'Pouvez-vous passer jeudi ?',
            'mentions' => $mentions,
        ])->assertCreated()
            ->assertJsonPath('data.metadata.mentions', $this->trie([$this->locataire->id, $this->collegue->id]))
            ->json('data.id');

        $message = Message::query()->findOrFail($id);
        $this->assertSame($this->trie([$this->locataire->id, $this->collegue->id]), $message->metadata['mentions']);
        $this->assertSame('Pouvez-vous passer jeudi ?', $message->content, 'le texte ne porte aucun identifiant');
        $this->assertStringStartsWith('[', (string) json_encode($message->metadata['mentions']), 'une liste, jamais un objet');
    }

    public function test_une_note_vocale_porte_ses_mentions_a_cote_de_sa_duree(): void
    {
        Queue::fake();
        $message = $this->ecrire(['type' => MessageType::Audio->value, 'content' => 'Note vocale', 'metadata' => ['duration' => 12], 'mentions' => [$this->collegue->id]]);

        $this->assertSame(['duration' => 12, 'mentions' => [$this->collegue->id]], $message->metadata);
    }

    public function test_sans_mention_le_metadata_ne_change_pas(): void
    {
        Queue::fake();
        $message = $this->ecrire(['mentions' => []]);

        $this->assertNull($message->metadata);
    }

    // ── Refus en 422 ─────────────────────────────────────────────────────────────────────────────────

    public function test_mentionner_un_non_participant_est_refuse(): void
    {
        $etranger = $this->agentDeLAgence($this->agence);

        $this->envoyer(['content' => 'Bonjour', 'mentions' => [$this->collegue->id, $etranger->id]])
            ->assertStatus(422)
            ->assertJsonPath('code', 'messaging.mention_not_reader');

        $this->assertSame(0, Message::query()->count());
    }

    public function test_mentionner_qui_a_quitte_le_fil_est_refuse(): void
    {
        $this->fil->participants()->updateExistingPivot($this->collegue->id, ['left_at' => now()]);

        $this->envoyer(['content' => 'Bonjour', 'mentions' => [$this->collegue->id]])
            ->assertStatus(422)
            ->assertJsonPath('code', 'messaging.mention_not_reader');
    }

    public function test_un_super_admin_absent_du_fil_ne_peut_pas_etre_mentionne(): void
    {
        $operateur = User::factory()->create();
        $this->materializeRoleProfile($operateur, 'super_admin');

        $this->envoyer(['content' => 'Bonjour', 'mentions' => [$operateur->id]])
            ->assertStatus(422)
            ->assertJsonPath('code', 'messaging.mention_not_reader');
    }

    /**
     * AC1 — le locataire mentionné dans une note d'équipe : 422, aucun message, aucune notification.
     * Ablation : retirer la règle « lit ce message » de la requête rend ce test rouge.
     */
    public function test_ac1_mentionner_le_locataire_dans_une_note_est_refuse(): void
    {
        foreach ($this->nonLecteurs() as $nonLecteur) {
            $this->envoyer(['content' => 'Entre nous.', 'visibility' => 'team', 'mentions' => [$this->collegue->id, $nonLecteur->id]])
                ->assertStatus(422)
                ->assertJsonPath('code', 'messaging.mention_not_reader');
        }

        $this->assertSame(0, Message::query()->count(), 'aucun message écrit');
        $this->assertSame(0, AppNotification::query()->count(), 'aucune notification');
    }

    public function test_l_auteur_mentionne_le_collegue_dans_une_note(): void
    {
        $this->envoyer(['content' => 'Entre nous.', 'visibility' => 'team', 'mentions' => [$this->collegue->id]])
            ->assertCreated()
            ->assertJsonPath('data.metadata.mentions', [$this->collegue->id]);
    }

    public function test_plus_de_dix_mentions_sont_refusees(): void
    {
        $this->envoyer(['content' => 'Bonjour', 'mentions' => range(1, 11)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('mentions');
    }

    public function test_une_mention_qui_n_est_pas_un_identifiant_est_refusee(): void
    {
        $this->envoyer(['content' => 'Bonjour', 'mentions' => ['abc']])
            ->assertStatus(422)
            ->assertJsonValidationErrors('mentions.0');
    }

    public function test_une_photo_ne_porte_pas_de_mention(): void
    {
        $this->envoyer([
            'type' => 'image',
            'file' => UploadedFile::fake()->image('photo.jpg', 40, 40),
            'mentions' => [$this->collegue->id],
        ])->assertStatus(422)->assertJsonValidationErrors('mentions');

        $this->assertSame(0, Message::query()->count());
    }

    /** La route n'écrit pas de carte : la garde du type vit au point d'écriture. */
    public function test_une_carte_ne_porte_pas_de_mention(): void
    {
        try {
            $this->ecrire(['type' => MessageType::Card->value, 'content' => 'lease.created', 'metadata' => ['code' => 'lease.created'], 'mentions' => [$this->collegue->id]]);
            $this->fail('une carte mentionnée doit être refusée');
        } catch (ApiError $e) {
            $this->assertSame('messaging.mention_type', $e->errorCode);
        }

        $this->assertSame(0, Message::query()->count());
    }

    // ── Notification ─────────────────────────────────────────────────────────────────────────────────

    /**
     * AC2 — l'agent mentionné, en sourdine, reçoit `message.mention` une fois et rien d'autre ; le
     * participant non mentionné en sourdine ne reçoit rien ; le non mentionné hors sourdine reçoit
     * `message.received` comme avant.
     */
    public function test_ac2_le_mentionne_en_sourdine_recoit_une_seule_mention(): void
    {
        Queue::fake();
        $this->enSourdine($this->collegue);
        $this->enSourdine($this->bailleur);

        $message = $this->ecrire(['mentions' => [$this->collegue->id]]);
        $this->jouerLeJob($message);

        $this->assertSame([[$this->collegue->id, 'message.mention']], $this->envoisDe($this->collegue));
        $this->assertSame([], $this->envoisDe($this->bailleur), 'non mentionné, en sourdine : rien');
        $this->assertSame([[$this->locataire->id, 'message.received']], $this->envoisDe($this->locataire));
        $this->assertSame([[$this->agentAilleurs->id, 'message.received']], $this->envoisDe($this->agentAilleurs));
    }

    /** Le même cas par le vrai service : une seule ligne, `message.mention`, avec l'extrait du message. */
    public function test_ac2_bis_une_seule_ligne_de_notification_par_le_vrai_service(): void
    {
        Queue::fake();
        $this->enSourdine($this->collegue);

        $message = $this->ecrire(['content' => 'Pouvez-vous passer jeudi ?', 'mentions' => [$this->collegue->id]]);
        (new NotifyNewMessageJob($message->id))->handle(app(NotificationService::class));

        $lignes = AppNotification::query()->where('user_id', $this->collegue->id)->get();
        $this->assertCount(1, $lignes);
        $this->assertSame('message.mention', $lignes->first()->code);
        $this->assertSame(['sender' => $this->auteur->nameWithoutContact(), 'excerpt' => 'Pouvez-vous passer jeudi ?'], $lignes->first()->params);
        $this->assertSame(0, AppNotification::query()->where('code', 'message.received')->where('user_id', $this->collegue->id)->count());
    }

    /** AC3 — qui quitte le fil entre l'envoi et le job n'est pas prévenu. */
    public function test_ac3_le_mentionne_qui_quitte_le_fil_avant_le_job_n_est_pas_prevenu(): void
    {
        Queue::fake();
        $message = $this->ecrire(['mentions' => [$this->collegue->id, $this->locataire->id]]);
        Queue::assertPushed(NotifyNewMessageJob::class);

        $this->fil->participants()->updateExistingPivot($this->collegue->id, ['left_at' => now()]);
        $this->jouerLeJob($message);

        $this->assertSame([], $this->envoisDe($this->collegue));
        $this->assertSame([[$this->locataire->id, 'message.mention']], $this->envoisDe($this->locataire), 'le témoin reste prévenu');
    }

    /** AC3, note — qui quitte l'agence entre l'envoi et le job ne lit plus la note : il n'est pas prévenu. */
    public function test_ac3_bis_le_mentionne_d_une_note_qui_quitte_l_agence_n_est_pas_prevenu(): void
    {
        Queue::fake();
        $temoin = $this->agentDeLAgence($this->agence);
        $this->fil->participants()->attach($temoin->id, ['role' => 'member', 'joined_at' => now()]);
        $message = $this->ecrire(['visibility' => 'team', 'mentions' => [$this->collegue->id, $temoin->id]]);

        AgentProfile::query()->where('user_id', $this->collegue->id)->delete();
        $this->jouerLeJob($message);

        $this->assertSame([], $this->envoisDe($this->collegue));
        $this->assertSame([[$temoin->id, 'message.mention']], $this->envoisDe($temoin));
    }

    /**
     * AC1, au départ — une note dont `metadata.mentions` nomme le locataire (écrite hors de la route) ne
     * le prévient pas : le job ne notifie que les mentionnés qui lisent le message, même en sourdine.
     */
    public function test_ac1_bis_le_job_ne_previent_pas_un_mentionne_qui_ne_lit_pas_la_note(): void
    {
        Queue::fake();
        $this->enSourdine($this->locataire);
        $note = $this->fil->messages()->create([
            'sender_id' => $this->auteur->id,
            'content' => 'Entre nous.',
            'type' => MessageType::Text->value,
            'visibility' => 'team',
            'metadata' => ['mentions' => [$this->locataire->id, $this->collegue->id]],
        ]);

        $this->jouerLeJob($note);

        $this->assertSame([], $this->envoisDe($this->locataire));
        $this->assertSame([[$this->collegue->id, 'message.mention']], $this->envoisDe($this->collegue));
    }

    // ── Non-fuite ────────────────────────────────────────────────────────────────────────────────────

    /** AC4 — `metadata.mentions` d'une note ne sort vers aucun lecteur qui ne la lit pas. */
    public function test_ac4_les_mentions_d_une_note_ne_sortent_pas_vers_qui_ne_la_lit_pas(): void
    {
        Queue::fake();
        $this->ecrire(['visibility' => 'team', 'content' => 'Entre nous.', 'mentions' => [$this->collegue->id]]);

        foreach ($this->nonLecteurs() as $lecteur) {
            Sanctum::actingAs($lecteur);
            $corps = (string) json_encode($this->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk()->json());
            $this->assertStringNotContainsString('mentions', $corps, "rien vers #{$lecteur->id}");
            $this->assertStringNotContainsString('Entre nous.', $corps);
        }

        Sanctum::actingAs($this->collegue);
        $this->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk()
            ->assertJsonPath('data.0.metadata.mentions', [$this->collegue->id]);
    }

    // ── Outils ───────────────────────────────────────────────────────────────────────────────────────

    /** @param array<string, mixed> $corps */
    private function envoyer(array $corps): TestResponse
    {
        Sanctum::actingAs($this->auteur);

        return $this->postJson("/api/conversations/{$this->fil->id}/messages", $corps);
    }

    /** Écrit par `ConversationWriter`, au nom de l'auteur de la scène. @param array<string, mixed> $attributs */
    private function ecrire(array $attributs): Message
    {
        return app(ConversationWriter::class)->post($this->auteur, $this->fil, array_merge([
            'content' => 'Pouvez-vous passer jeudi ?',
            'type' => MessageType::Text->value,
        ], $attributs));
    }

    private function enSourdine(User $user): void
    {
        $this->fil->participants()->updateExistingPivot($user->id, ['is_muted' => true]);
    }

    private function jouerLeJob(Message $message): void
    {
        $service = Mockery::mock(NotificationService::class);
        $service->shouldReceive('send')->andReturnUsing(function (User $u, NotificationCode $code) {
            $this->envois[] = [(int) $u->id, $code->value];

            return null;
        });
        (new NotifyNewMessageJob($message->id))->handle($service);
    }

    /** @return list<array{int, string}> */
    private function envoisDe(User $user): array
    {
        return array_values(array_filter($this->envois, fn (array $e): bool => $e[0] === (int) $user->id));
    }

    /** @param list<int> $ids @return list<int> */
    private function trie(array $ids): array
    {
        sort($ids);

        return $ids;
    }
}
