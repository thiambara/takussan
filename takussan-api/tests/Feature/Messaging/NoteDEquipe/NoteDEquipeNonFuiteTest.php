<?php

namespace Tests\Feature\Messaging\NoteDEquipe;

use App\Jobs\NotifyNewMessageJob;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageVisibility;
use App\Models\Enums\ParticipantRole;
use App\Models\Message;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Admin\ImpersonationService;
use App\Services\Model\NotificationService;
use App\Services\Privacy\DataExportBuilder;
use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\SignalTempsReel;
use App\Support\TempsReel\TempsReel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\ApiTestCase;
use Tests\Support\SceneDeNoteDEquipe;

/**
 * TCK-2965 (ADR-0128 § 6, « Application ») — la matrice de non-fuite de la note d'équipe : UN test par
 * chemin de lecture, chacun vérifié par ablation (le filtre de CE chemin retiré, ce test rougit). Trois
 * lecteurs qui ne lisent pas la note — le locataire, le bailleur, l'agent d'une autre agence membre du
 * groupe — et un témoin qui la lit : le collègue de l'auteur, personnel actif de l'agence du fil.
 *
 * La recherche (Meilisearch) a sa propre classe : `NoteDEquipeRechercheTest`.
 */
class NoteDEquipeNonFuiteTest extends ApiTestCase
{
    use RefreshDatabase, SceneDeNoteDEquipe;

    private const NOTE = 'Le bailleur hésite à renouveler, ne rien promettre.';

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function lire(User $lecteur, string $uri): string
    {
        Sanctum::actingAs($lecteur);

        // Décodé puis réécrit sans échappement : « é » sort `\u00e9` du JSON brut, et une recherche du
        // texte exact y serait vide quoi qu'il arrive.
        return (string) json_encode($this->getJson($uri)->assertOk()->json(), JSON_UNESCAPED_UNICODE);
    }

    /** @return array<string, mixed> */
    private function liste(User $lecteur, string $requete = ''): array
    {
        Sanctum::actingAs($lecteur);

        return $this->getJson('/api/conversations'.$requete)->assertOk()->json();
    }

    /** @param  array<string, mixed>  $liste */
    private function ligneDuFil(array $liste): array
    {
        return collect($liste['data'])->firstWhere('id', $this->fil->id) ?? [];
    }

    // ── 1. GET …/messages, en page (premier chargement et `before_id`) ───────────────────────────────

    public function test_chemin_1a_la_page_du_fil(): void
    {
        $this->ecrireUnMessage('Bonjour à tous.');
        $note = $this->ecrireUneNote(self::NOTE);
        $apres = $this->ecrireUnMessage('Le dossier avance.');

        foreach ($this->nonLecteurs() as $lecteur) {
            foreach (['', "?before_id={$apres->id}"] as $curseur) {
                $corps = $this->lire($lecteur, "/api/conversations/{$this->fil->id}/messages{$curseur}");
                $this->assertStringNotContainsString(self::NOTE, $corps, "la page {$curseur} de #{$lecteur->id}");
                $this->assertNotContains($note->id, array_column(json_decode($corps, true)['data'], 'id'));
            }
        }

        Sanctum::actingAs($this->collegue);
        $this->getJson("/api/conversations/{$this->fil->id}/messages?before_id={$apres->id}")
            ->assertOk()
            ->assertJsonFragment(['content' => self::NOTE, 'visibility' => 'team']);
    }

    // ── 1 bis. GET …/messages en suite (`after_id`, le relevé du temps réel) ─────────────────────────

    public function test_chemin_1b_la_suite_du_fil(): void
    {
        $avant = $this->ecrireUnMessage('Bonjour à tous.');
        $this->ecrireUneNote(self::NOTE);

        foreach ($this->nonLecteurs() as $lecteur) {
            $this->assertStringNotContainsString(self::NOTE, $this->lire($lecteur, "/api/conversations/{$this->fil->id}/messages?after_id={$avant->id}"));
        }

        $this->assertStringContainsString(self::NOTE, $this->lire($this->collegue, "/api/conversations/{$this->fil->id}/messages?after_id={$avant->id}"));
    }

    // ── 2. GET /api/conversations : l'aperçu commun et l'ordre (AC3) ─────────────────────────────────

    /** Par la route : `ConversationWriter` ne touche pas le pointeur du fil pour une note. */
    public function test_chemin_2a_l_apercu_commun_et_l_ordre_ne_bougent_pas(): void
    {
        Carbon::setTestNow('2026-11-18 09:00:00');
        $this->ecrireUnMessage('Bonjour à tous.');
        Carbon::setTestNow('2026-11-18 10:00:00');
        $plusRecent = $this->groupe([$this->auteur, $this->locataire, $this->bailleur, $this->agentAilleurs, $this->collegue], ['property_id' => $this->bien->id]);
        $this->ecrireUnMessage('Autre sujet.', fil: $plusRecent);
        $avant = $this->fil->fresh();

        Carbon::setTestNow('2026-11-18 11:00:00');
        $this->ecrireUneNote(self::NOTE);

        $apres = $this->fil->fresh();
        $this->assertSame($avant->last_message_id, $apres->last_message_id);
        $this->assertSame($avant->last_message_preview, $apres->last_message_preview);
        $this->assertEquals($avant->last_message_at, $apres->last_message_at);

        foreach ([...$this->nonLecteurs(), $this->collegue] as $lecteur) {
            $liste = $this->liste($lecteur);
            $ligne = $this->ligneDuFil($liste);
            $this->assertSame('Bonjour à tous.', $ligne['last_message_preview'], "#{$lecteur->id}");
            $this->assertSame($avant->last_message_id, $ligne['last_message']['id']);
            $this->assertStringNotContainsString(self::NOTE, json_encode($liste, JSON_UNESCAPED_UNICODE));
            $ordre = collect($liste['data'])->pluck('id')->filter(fn ($id) => in_array($id, [$this->fil->id, $plusRecent->id], true))->values()->all();
            $this->assertSame([$plusRecent->id, $this->fil->id], $ordre, "l'ordre de la liste de #{$lecteur->id}");
        }
    }

    /** Hors de la route (un écrivain qui ne passe que par le modèle) : l'observateur, seul, se garde. */
    public function test_chemin_2a_bis_l_observateur_ne_touche_pas_l_apercu(): void
    {
        $this->ecrireUnMessage('Bonjour à tous.');
        $avant = $this->fil->fresh();

        Message::create([
            'conversation_id' => $this->fil->id,
            'sender_id' => $this->auteur->id,
            'type' => 'text',
            'content' => self::NOTE,
            'visibility' => MessageVisibility::Team->value,
        ]);

        $apres = $this->fil->fresh();
        $this->assertSame($avant->last_message_id, $apres->last_message_id);
        $this->assertSame($avant->last_message_preview, $apres->last_message_preview);
    }

    // ── 2 bis. GET /api/conversations : les non-lus ──────────────────────────────────────────────────

    public function test_chemin_2b_les_non_lus_de_la_liste(): void
    {
        $this->ecrireUneNote(self::NOTE);

        foreach ($this->nonLecteurs() as $lecteur) {
            $liste = $this->liste($lecteur);
            $this->assertSame(0, $this->ligneDuFil($liste)['unread_count'], "unread_count de #{$lecteur->id}");
            $this->assertSame(0, $liste['meta']['unread_total'], "unread_total de #{$lecteur->id}");
            $this->assertSame(0, $liste['meta']['counts']['unread'], "counts.unread de #{$lecteur->id}");
            $this->assertNotContains($this->fil->id, collect($this->liste($lecteur, '?filter[unread]=1')['data'])->pluck('id')->all());
        }

        $liste = $this->liste($this->collegue);
        $this->assertSame(1, $this->ligneDuFil($liste)['unread_count']);
        $this->assertSame(1, $liste['meta']['unread_total']);
        $this->assertSame(1, $liste['meta']['counts']['unread']);
    }

    /** Une note ne fait pas reparaître chez un client le fil qu'il avait archivé. */
    public function test_chemin_2c_une_note_ne_desarchive_pas_le_fil_d_un_client(): void
    {
        DB::table('conversation_participants')->where('conversation_id', $this->fil->id)->update(['archived_at' => now()->subHour()]);

        $this->ecrireUneNote(self::NOTE);

        foreach ($this->nonLecteurs() as $lecteur) {
            $this->assertNotContains($this->fil->id, collect($this->liste($lecteur)['data'])->pluck('id')->all(), "#{$lecteur->id}");
        }
        $this->assertContains($this->fil->id, collect($this->liste($this->collegue)['data'])->pluck('id')->all());
    }

    // ── 3. GET /api/conversations/{id} et `markAsUnread` ─────────────────────────────────────────────

    public function test_chemin_3a_la_fiche_du_fil(): void
    {
        $this->ecrireUnMessage('Bonjour à tous.');
        $this->ecrireUneNote(self::NOTE);

        foreach ([...$this->nonLecteurs(), $this->collegue] as $lecteur) {
            $this->assertStringNotContainsString(self::NOTE, $this->lire($lecteur, "/api/conversations/{$this->fil->id}"));
        }
    }

    public function test_chemin_3b_marquer_non_lu_recule_sur_le_dernier_message_lisible(): void
    {
        Carbon::setTestNow('2026-11-18 10:00:00');
        $this->ecrireUnMessage('Bonjour à tous.');
        Carbon::setTestNow('2026-11-18 10:05:00');
        $this->ecrireUneNote(self::NOTE);
        Carbon::setTestNow('2026-11-18 10:10:00');
        DB::table('conversation_participants')->where('conversation_id', $this->fil->id)->update(['last_read_at' => now()]);

        foreach ($this->nonLecteurs() as $lecteur) {
            Sanctum::actingAs($lecteur);
            $this->putJson("/api/conversations/{$this->fil->id}/unread")->assertOk()
                ->assertJsonPath('data.last_read_at', Carbon::parse('2026-11-18 09:59:59')->toIso8601String());
        }

        Sanctum::actingAs($this->collegue);
        $this->putJson("/api/conversations/{$this->fil->id}/unread")->assertOk()
            ->assertJsonPath('data.last_read_at', Carbon::parse('2026-11-18 10:04:59')->toIso8601String());
    }

    // ── 5. NotifyNewMessageJob : tous les canaux passent par `NotificationService::send` ─────────────

    public function test_chemin_5_la_notification(): void
    {
        Queue::fake();
        $note = $this->ecrireUneNote(self::NOTE);

        $destinataires = [];
        $service = Mockery::mock(NotificationService::class);
        $service->shouldReceive('send')->andReturnUsing(function (User $u) use (&$destinataires) {
            $destinataires[] = (int) $u->id;
        });
        (new NotifyNewMessageJob($note->id))->handle($service);

        $this->assertSame([$this->collegue->id], $destinataires, 'seul le collègue est notifié');
    }

    // ── 6. Le temps réel (AC4) ───────────────────────────────────────────────────────────────────────

    public function test_chemin_6_le_temps_reel(): void
    {
        $faux = TempsReel::fake();

        $this->ecrireUneNote(self::NOTE);

        $canauxDuFil = "sujet.conversation.{$this->fil->id}";
        $envois = $faux->envois();
        $this->assertSame([], array_values(array_filter($envois, fn (SignalTempsReel $s) => in_array($canauxDuFil, $s->canaux, true))), 'rien sur le canal du fil');
        foreach ($this->nonLecteurs() as $lecteur) {
            $this->assertSame([], array_values(array_filter($envois, fn (SignalTempsReel $s) => in_array("utilisateur.{$lecteur->id}", $s->canaux, true))), "rien vers #{$lecteur->id}");
        }
        TempsReel::assertSignale(CodeDeSignal::MessageCreated, "utilisateur.{$this->collegue->id}", "conversation:{$this->fil->id}");
        TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$this->collegue->id}");
    }

    /** Un message `all` garde ses deux signaux : le fil et la boîte de chaque participant actif. */
    public function test_chemin_6_bis_un_message_pour_tous_signale_comme_avant(): void
    {
        TempsReel::fake();

        $this->ecrireUnMessage('Bonjour à tous.');

        TempsReel::assertSignale(CodeDeSignal::MessageCreated, "sujet.conversation.{$this->fil->id}");
        TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$this->locataire->id}");
    }

    // ── 7. Les accusés de lecture (`FaitsDesMessages`) ───────────────────────────────────────────────

    public function test_chemin_7_l_accuse_d_une_note_ne_compte_que_ses_lecteurs(): void
    {
        Carbon::setTestNow('2026-11-18 10:00:00');
        $message = $this->ecrireUnMessage('Bonjour à tous.');
        $note = $this->ecrireUneNote(self::NOTE);
        Carbon::setTestNow('2026-11-18 10:10:00');
        // Les trois clients lisent le fil ; le collègue, non.
        DB::table('conversation_participants')->where('conversation_id', $this->fil->id)
            ->whereIn('user_id', array_map(fn (User $u) => $u->id, $this->nonLecteurs()))
            ->update(['last_read_at' => now()]);

        Sanctum::actingAs($this->auteur);
        $page = collect($this->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk()->json('data'))->keyBy('id');

        $this->assertSame(3, $page[$message->id]['read_count'], 'le message pour tous : ses trois lecteurs');
        $this->assertSame(0, $page[$note->id]['read_count'], 'la note : aucun client ne compte');
    }

    /** Une directe dont l'autre ne lit pas la note : l'accusé de la note n'affirme rien. */
    public function test_chemin_7_bis_une_directe_n_accuse_pas_la_note(): void
    {
        $directe = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'created_by' => $this->auteur->id,
            'lease_id' => $this->bail->id,
        ]);
        foreach ([$this->auteur, $this->locataire] as $membre) {
            $directe->participants()->attach($membre->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
        }
        Carbon::setTestNow('2026-11-18 10:00:00');
        $message = $this->ecrireUnMessage('Bonjour.', fil: $directe);
        $note = $this->ecrireUneNote(self::NOTE, fil: $directe);
        Carbon::setTestNow('2026-11-18 10:10:00');
        DB::table('conversation_participants')->where('conversation_id', $directe->id)->where('user_id', $this->locataire->id)->update(['last_read_at' => now()]);

        Sanctum::actingAs($this->auteur);
        $page = collect($this->getJson("/api/conversations/{$directe->id}/messages")->assertOk()->json('data'))->keyBy('id');
        $this->assertTrue($page[$message->id]['read_by_recipient']);
        $this->assertNull($page[$note->id]['read_by_recipient']);
    }

    // ── 8. L'export des données (`DataExportBuilder`) ────────────────────────────────────────────────

    public function test_chemin_8_l_export_des_donnees(): void
    {
        $this->ecrireUnMessage('Bonjour à tous.');
        $note = $this->ecrireUneNote(self::NOTE);

        foreach ([...$this->nonLecteurs(), $this->collegue] as $titulaire) {
            $ids = collect(app(DataExportBuilder::class)->payloads($titulaire)['messages.json'])->pluck('id')->all();
            $this->assertNotContains($note->id, $ids, "l'export de #{$titulaire->id}");
            $this->assertNotEmpty($ids, 'le message pour tous y est');
        }

        $this->assertContains($note->id, collect(app(DataExportBuilder::class)->payloads($this->auteur)['messages.json'])->pluck('id')->all(), 'l\'auteur exporte sa note');
    }

    // ── 9. Les routes qui reçoivent un identifiant de message ────────────────────────────────────────

    /**
     * Relevé du 2026-11-18 : aucune route ne reçoit un message (ni modification, ni suppression, ni
     * signalement de message, ni pièce par message — les pièces sortent par URL signée, dans la seule
     * page filtrée). Une route neuve qui en recevrait un doit juger `messagesLisiblesPar` : ce test
     * rougit pour qu'on l'y ajoute.
     */
    public function test_chemin_9_aucune_route_ne_recoit_un_message(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes())
            ->filter(fn ($r) => preg_match('/\{(message|messages|message_id|messageId)\??\}/', $r->uri()) === 1);

        $this->assertSame(array_keys(self::ROUTES_QUI_JUGENT_LA_LECTURE), $routes->map(fn ($r) => $r->uri())->values()->all());

        // Chaque route admise résout son message par `messagesLisiblesPar` dans l'action même qu'elle appelle.
        foreach ($routes as $route) {
            [$classe, $methode] = explode('@', (string) $route->getActionName());
            $action = new \ReflectionMethod($classe, $methode);
            $source = implode('', array_slice((array) file((string) $action->getFileName()), $action->getStartLine() - 1, $action->getEndLine() - $action->getStartLine() + 1));
            $this->assertStringContainsString('messagesLisiblesPar(', $source, "{$route->uri()} ne juge pas la lecture du message");
        }
    }

    /**
     * TCK-2985 (rouge CI de #1700) — les routes qui reçoivent un message, chacune jugée par `messagesLisiblesPar`
     * (contrôlé ci-dessus dans la source de son action) et sa preuve de non-fuite.
     *
     * @var array<string, string>
     */
    private const ROUTES_QUI_JUGENT_LA_LECTURE = [
        'api/conversations/{conversation}/messages/{message}/transcription' => 'TCK-2976 : MessageTranscriptionController::store, 404 hors lecture — TranscriptionDuFilTest::test_un_non_personnel_recoit_404_et_rien_ne_part',
    ];

    // ── AC6 — l'agent devenu inactif ne lit plus, même ses notes ─────────────────────────────────────

    public function test_ac6_l_agent_inactif_ne_lit_plus_les_notes_ni_les_siennes(): void
    {
        $this->ecrireUnMessage('Bonjour à tous.');
        $this->ecrireUneNote(self::NOTE);
        // Il est aussi bailleur actif de l'agence : le fil lui restera lisible (`contextAllows`).
        OwnerProfile::query()->firstOrCreate(['user_id' => $this->auteur->id, 'agency_id' => $this->agence->id]);
        // Témoin : avec ses deux profils actifs, il lit sa note.
        $this->assertStringContainsString(self::NOTE, $this->lire($this->auteur, "/api/conversations/{$this->fil->id}/messages"));

        AgentProfile::query()->where('user_id', $this->auteur->id)->update(['status' => 'suspended']);

        $corps = $this->lire($this->auteur, "/api/conversations/{$this->fil->id}/messages");
        $this->assertStringContainsString('Bonjour à tous.', $corps);
        $this->assertStringNotContainsString(self::NOTE, $corps);
    }

    // ── AC6 bis — le super-admin, hors et sous impersonation ─────────────────────────────────────────

    public function test_ac6_bis_le_super_admin_lit_la_note_hors_impersonation_pas_sous_celle_du_locataire(): void
    {
        $this->ecrireUneNote(self::NOTE);
        $operateur = User::factory()->create();
        $this->materializeRoleProfile($operateur, 'super_admin');

        $this->assertStringContainsString(self::NOTE, $this->lire($operateur, "/api/conversations/{$this->fil->id}/messages"));

        ['token' => $jeton] = app(ImpersonationService::class)->start($operateur, $this->locataire, 'Ticket support 4821 : relecture.');
        $this->app['auth']->forgetGuards();
        $corps = (string) json_encode($this->withToken($jeton)->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk()->json(), JSON_UNESCAPED_UNICODE);
        $this->assertStringNotContainsString(self::NOTE, $corps);
        $liste = $this->withToken($jeton)->getJson('/api/conversations')->assertOk()->json();
        $this->assertSame(0, $liste['meta']['unread_total']);
    }

    // ── AC7 — la pagination tient avec 30 notes entre deux messages ──────────────────────────────────

    public function test_ac7_trente_notes_entre_deux_messages(): void
    {
        Carbon::setTestNow('2026-11-18 08:00:00');
        $premier = $this->ecrireUnMessage('Premier message.');
        for ($i = 1; $i <= 30; $i++) {
            Carbon::setTestNow(Carbon::parse('2026-11-18 08:00:00')->addMinutes($i));
            $this->ecrireUneNote("Note {$i}");
        }
        Carbon::setTestNow('2026-11-18 09:00:00');
        $dernier = $this->ecrireUnMessage('Dernier message.');

        Sanctum::actingAs($this->locataire);
        $page = $this->getJson("/api/conversations/{$this->fil->id}/messages?per_page=20")->assertOk();
        $this->assertSame([$dernier->id, $premier->id], array_column($page->json('data'), 'id'));
        $this->assertFalse($page->json('meta.has_more'));

        Sanctum::actingAs($this->collegue);
        $page = $this->getJson("/api/conversations/{$this->fil->id}/messages?per_page=20")->assertOk();
        $this->assertCount(20, $page->json('data'));
        $this->assertTrue($page->json('meta.has_more'));
    }
}
