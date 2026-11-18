<?php

namespace Tests\Feature\TempsReel;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\EmetDesSignaux;
use App\Support\TempsReel\FauxTransport;
use App\Support\TempsReel\SignalTempsReel;
use App\Support\TempsReel\TempsReel;
use App\Support\TempsReel\TransportTempsReel;
use Illuminate\Broadcasting\Broadcasters\Broadcaster;
use Illuminate\Broadcasting\BroadcastManager;
use Illuminate\Foundation\Http\Events\RequestHandled;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Route;
use RuntimeException;
use Tests\TestCase;

/**
 * TCK-2952 (ADR-0129 § 3) — l'émetteur : après le COMMIT, dédoublonné par unité de travail, par paquets de
 * 100, et jamais en échec. Seul le transport est remplacé ; la transaction, elle, est une vraie transaction.
 */
class EmetteurTest extends TestCase
{
    use RefreshDatabase;

    private function compteurDuJour(): int
    {
        return (int) Cache::get(TempsReel::PREFIXE_DU_COMPTEUR.now()->format('Y-m-d'), 0);
    }

    /** Un transport qui lève à chaque appel, et compte ses appels. */
    private function transportQuiLeve(): object
    {
        $transport = new class implements TransportTempsReel
        {
            public int $appels = 0;

            public function envoyer(SignalTempsReel $signal): void
            {
                $this->appels++;

                throw new RuntimeException('Pusher error: https://reverb.example/apps/1/events?auth_key=cle&auth_signature=sig — Awa Diop');
            }
        };
        $this->app->instance(TransportTempsReel::class, $transport);

        return $transport;
    }

    public function test_la_suite_ne_diffuse_vers_aucun_serveur(): void
    {
        // `env()` rend `null` pour la chaîne « null » de `phpunit.xml`.
        $this->assertContains(config('broadcasting.default'), [null, 'null']);
        $this->assertSame(['connect_timeout' => 1, 'timeout' => 1], config('broadcasting.connections.reverb.client_options'));
    }

    public function test_un_signal_valide_part_et_porte_trois_cles_dont_un_curseur_a_la_microseconde(): void
    {
        $faux = TempsReel::fake();

        DB::transaction(fn () => TempsReel::signalerA(42, CodeDeSignal::NotificationsUpdated));

        TempsReel::assertSignale(CodeDeSignal::NotificationsUpdated, 'utilisateur.42', 'utilisateur:42', 1);
        $charge = $faux->envois()[0]->broadcastWith();
        $this->assertSame(['subject', 'event', 'cursor'], array_keys($charge));
        $this->assertMatchesRegularExpression('/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\z/', $charge['cursor']);
    }

    public function test_une_transaction_annulee_n_emet_rien(): void
    {
        TempsReel::fake();

        try {
            DB::transaction(function (): void {
                TempsReel::signalerA(42, CodeDeSignal::NotificationsUpdated);

                throw new RuntimeException('annulée');
            });
        } catch (RuntimeException) {
        }

        TempsReel::assertRienSignale();

        // Le même signal, validé ensuite, part : l'annulé n'a pas été compté comme émis.
        DB::transaction(fn () => TempsReel::signalerA(42, CodeDeSignal::NotificationsUpdated));
        TempsReel::assertSignale(CodeDeSignal::NotificationsUpdated, 'utilisateur.42', fois: 1);
    }

    public function test_un_signal_attend_le_commit_de_la_transaction(): void
    {
        $faux = TempsReel::fake();

        DB::transaction(function () use ($faux): void {
            TempsReel::signalerA(42, CodeDeSignal::NotificationsUpdated);
            $this->assertSame([], $faux->envois(), 'parti avant le COMMIT');
        });

        $this->assertCount(1, $faux->envois());
    }

    public function test_deux_appels_identiques_dans_une_unite_partent_une_fois(): void
    {
        $faux = TempsReel::fake();

        TempsReel::signalerA(42, CodeDeSignal::NotificationsUpdated);
        TempsReel::signalerA(42, CodeDeSignal::NotificationsUpdated);
        TempsReel::signalerA(43, CodeDeSignal::NotificationsUpdated);

        $this->assertCount(2, $faux->envois());
    }

    /** AC6 — le worker vide les instances de portée avant chaque job (`QueueServiceProvider::registerWorker`). */
    public function test_deux_jobs_du_meme_processus_emettent_chacun(): void
    {
        $faux = TempsReel::fake();

        TempsReel::signalerA(42, CodeDeSignal::NotificationsUpdated); // job 1
        $this->app->forgetScopedInstances();                          // ce que fait le worker entre deux jobs
        TempsReel::signalerA(42, CodeDeSignal::NotificationsUpdated); // job 2

        $this->assertCount(2, $faux->envois());
    }

    public function test_deux_requetes_du_meme_processus_emettent_chacune(): void
    {
        $faux = TempsReel::fake();

        TempsReel::signalerA(42, CodeDeSignal::NotificationsUpdated);
        event(new RequestHandled(Request::create('/api/x'), new Response));
        TempsReel::signalerA(42, CodeDeSignal::NotificationsUpdated);

        $this->assertCount(2, $faux->envois());
    }

    public function test_un_sujet_donne_est_le_meme_pour_tous_les_destinataires_d_un_envoi(): void
    {
        $faux = TempsReel::fake();
        $fil = Conversation::factory()->create();

        TempsReel::signalerA([7, 8, 7], CodeDeSignal::BoiteUpdated, $fil);
        TempsReel::signaler($fil, CodeDeSignal::MessageCreated);

        $this->assertCount(2, $faux->envois());
        [$boite, $fil_] = $faux->envois();
        $this->assertSame(['utilisateur.7', 'utilisateur.8'], $boite->canaux);
        $this->assertSame("conversation:{$fil->id}", $boite->sujet);
        $this->assertSame(["sujet.conversation.{$fil->id}"], $fil_->canaux);
        $this->assertSame("conversation:{$fil->id}", $fil_->sujet);
    }

    /** AC5 bis — 150 destinataires : deux envois, de 100 puis 50 canaux. */
    public function test_cent_cinquante_destinataires_partent_en_deux_envois(): void
    {
        $faux = TempsReel::fake();
        $fil = Conversation::factory()->create();

        TempsReel::signalerA(range(1, 150), CodeDeSignal::BoiteUpdated, $fil);

        $this->assertSame([100, 50], array_map(fn (SignalTempsReel $s): int => count($s->canaux), $faux->envois()));
        $this->assertSame($faux->envois()[0]->curseur, $faux->envois()[1]->curseur);
    }

    /** AC5 bis — le disjoncteur : après un échec, plus aucun appel au transport dans l'unité ; chaque abandon compte. */
    public function test_apres_un_echec_le_transport_n_est_plus_appele(): void
    {
        $transport = $this->transportQuiLeve();
        $fil = Conversation::factory()->create();

        TempsReel::signalerA(range(1, 150), CodeDeSignal::BoiteUpdated, $fil);
        TempsReel::signaler($fil, CodeDeSignal::MessageCreated);

        $this->assertSame(1, $transport->appels);
        $this->assertSame(3, $this->compteurDuJour());
    }

    /** AC5 — un transport qui lève : la requête répond son code nominal, le compteur monte, le journal se tait. */
    public function test_un_transport_qui_leve_ne_casse_pas_la_requete(): void
    {
        $this->transportQuiLeve();
        Log::spy();
        Route::post('/api/test-temps-reel', function () {
            TempsReel::signalerA(42, CodeDeSignal::NotificationsUpdated);

            return response()->json(['ok' => true], 201);
        })->middleware('api');

        $this->postJson('/api/test-temps-reel')->assertCreated();

        $this->assertSame(1, $this->compteurDuJour());
        Log::shouldHaveReceived('warning')->withArgs(function (string $message, array $contexte): bool {
            $this->assertSame(['canal', 'canaux', 'code', 'exception'], array_keys($contexte));
            $this->assertSame(['utilisateur.42', 1, 'notifications.updated', RuntimeException::class], array_values($contexte));
            $this->assertStringNotContainsString('Awa', json_encode($contexte));

            return true;
        })->once();
    }

    /**
     * AC5 — le transport RÉEL contre un Reverb injoignable (port fermé, ou adresse qui ne répond pas) : la
     * requête n'échoue pas, l'échec est compté, et le délai d'1 s borne l'attente.
     */
    public function test_un_reverb_injoignable_ne_coute_qu_un_delai_court(): void
    {
        $this->basculerSurReverb('10.255.255.1', 6001);
        Log::spy();

        $debut = microtime(true);
        TempsReel::signalerA(range(1, 3), CodeDeSignal::NotificationsUpdated);
        $duree = microtime(true) - $debut;

        $this->assertSame(3, $this->compteurDuJour());
        $this->assertLessThan(3.0, $duree, 'le délai d\'1 s n\'est pas appliqué, ou le disjoncteur ne coupe pas');
        // L'échec vient bien du client HTTP du diffuseur, pas d'une faute du transport.
        Log::shouldHaveReceived('warning')->withArgs(
            fn (string $message, array $contexte): bool => ($contexte['exception'] ?? '') !== 'disjoncteur'
                && preg_match('/^(GuzzleHttp|Pusher|Illuminate\\\\Broadcasting)\\\\/', $contexte['exception']) === 1,
        )->once();
    }

    /**
     * AC5 — le délai de RÉPONSE : un Reverb qui accepte la connexion et ne répond jamais. Le client Pusher
     * pose son propre délai à chaque requête (30 s par défaut) : c'est `options.timeout` qui le borne.
     */
    public function test_un_reverb_qui_ne_repond_pas_ne_coute_qu_un_delai_court(): void
    {
        $serveur = stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
        $this->assertNotFalse($serveur, $errstr);
        $port = (int) substr((string) strrchr((string) stream_socket_get_name($serveur, false), ':'), 1);
        $this->basculerSurReverb('127.0.0.1', $port);

        try {
            $debut = microtime(true);
            TempsReel::signalerA(42, CodeDeSignal::NotificationsUpdated);
            $duree = microtime(true) - $debut;
        } finally {
            fclose($serveur);
        }

        $this->assertSame(1, $this->compteurDuJour());
        $this->assertLessThan(2.5, $duree, 'le délai de réponse d\'1 s n\'est pas appliqué');
    }

    /** La forme sur le fil, celle que TCK-2954 écoute : canaux préfixés, événement `signal`, trois clés. */
    public function test_le_transport_reel_remet_le_signal_au_diffuseur(): void
    {
        $diffuseur = new class extends Broadcaster
        {
            /** @var list<array{0: array, 1: string, 2: array}> */
            public array $envois = [];

            public function auth($request) {}

            public function validAuthenticationResponse($request, $result) {}

            public function broadcast(array $channels, $event, array $payload = [])
            {
                $this->envois[] = [array_map('strval', $channels), $event, $payload];
            }
        };
        $this->app->make(BroadcastManager::class)->extend('enregistreur', fn () => $diffuseur);
        config(['broadcasting.default' => 'enregistreur', 'broadcasting.connections.enregistreur' => ['driver' => 'enregistreur']]);
        $this->app->make(BroadcastManager::class)->forgetDrivers();

        TempsReel::signalerA([42, 43], CodeDeSignal::NotificationsUpdated);

        $this->assertCount(2, $diffuseur->envois);
        [$canaux, $evenement, $charge] = $diffuseur->envois[0];
        $this->assertSame(['private-utilisateur.42'], $canaux);
        $this->assertSame('signal', $evenement);
        // `socket` est la clé de `toOthers()` que le framework ajoute ; le diffuseur Pusher la retire du corps.
        unset($charge['socket']);
        $this->assertSame(['subject', 'event', 'cursor'], array_keys($charge));
        $this->assertSame(['utilisateur:42', 'notifications.updated'], [$charge['subject'], $charge['event']]);
    }

    private function basculerSurReverb(string $hote, int $port): void
    {
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'cle',
            'broadcasting.connections.reverb.secret' => 'secret',
            'broadcasting.connections.reverb.app_id' => '1',
            'broadcasting.connections.reverb.options.host' => $hote,
            'broadcasting.connections.reverb.options.port' => $port,
            'broadcasting.connections.reverb.options.scheme' => 'http',
            'broadcasting.connections.reverb.options.useTLS' => false,
        ]);
        $this->app->make(BroadcastManager::class)->forgetDrivers();
    }

    public function test_notification_service_signale_notifications_updated_au_destinataire_et_rien_d_autre(): void
    {
        Notification::fake();
        $faux = TempsReel::fake();
        $user = User::factory()->create(['preferred_language' => 'fr']);

        app(NotificationService::class)->send($user, NotificationCode::LeasePaymentRecorded, [
            'amount' => NotificationRenderer::money(150000, 'XOF'),
            'property' => 'Villa Almadies',
        ], NotificationTarget::of('lease', 42));

        $this->assertCount(1, $faux->envois());
        TempsReel::assertSignale(CodeDeSignal::NotificationsUpdated, "utilisateur.{$user->id}", "utilisateur:{$user->id}", 1);
        $this->assertStringNotContainsString('Villa', json_encode($faux->envois()[0]->broadcastWith()));
    }

    public function test_le_trait_emet_sur_le_sujet_declare(): void
    {
        $faux = TempsReel::fake();
        $fil = Conversation::factory()->create();

        $message = MessageQuiSignale::query()->create(Message::factory()->raw(['conversation_id' => $fil->id]));
        $message->update(['content' => 'modifié']);

        TempsReel::assertSignale(CodeDeSignal::MessageCreated, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
        TempsReel::assertSignale(CodeDeSignal::MessageUpdated, "sujet.conversation.{$fil->id}", "conversation:{$fil->id}", 1);
        $this->assertCount(2, $faux->envois());
        $this->assertInstanceOf(FauxTransport::class, app(TransportTempsReel::class));
    }
}

/** Un message qui déclare ses signaux, pour éprouver le trait sans brancher le vrai modèle (TCK-2955). */
class MessageQuiSignale extends Message
{
    use EmetDesSignaux;

    protected $table = 'messages';

    protected static function signauxTempsReel(): array
    {
        return [
            'created' => [[CodeDeSignal::MessageCreated, fn (Message $m) => Conversation::query()->find($m->conversation_id)]],
            'updated' => [[CodeDeSignal::MessageUpdated, fn (Message $m) => Conversation::query()->find($m->conversation_id)]],
        ];
    }
}
