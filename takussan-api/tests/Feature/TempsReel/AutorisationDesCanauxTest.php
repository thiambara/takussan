<?php

namespace Tests\Feature\TempsReel;

use App\Models\Conversation;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use App\Support\TempsReel\CanauxTempsReel;
use Closure;
use Illuminate\Broadcasting\BroadcastManager;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Support\SessionsDImpersonation;

/**
 * TCK-2952 (ADR-0129 § 2 et § 4) — l'autorisation des canaux temps réel, `POST /api/broadcasting/auth`.
 *
 * **La bascule sur `reverb` est ce qui fait juger ce test.** Sous le `BROADCAST_CONNECTION=null` de la suite,
 * `NullBroadcaster::auth()` n'évalue aucun canal et répond 200 à tout : chaque 403 ci-dessous passerait sans
 * rien juger (AC3, constaté par ablation de `setUp()`). La connexion bascule donc sur `reverb`, avec des clés
 * factices : le diffuseur Pusher signe la réponse localement, sans réseau. Les canaux sont alors relus sur ce
 * diffuseur — `withBroadcasting()` les avait inscrits, au démarrage, sur celui de la connexion `null`.
 *
 * Chaque refus a son témoin positif : le lecteur reçoit 200 et une signature `auth`.
 *
 * Le jeu de données est DÉRIVÉ du registre : chaque type de {@see CanauxTempsReel} doit avoir sa fixture
 * lecteur / non-lecteur dans {@see self::fixtures()}. Un type inscrit sans elle fait rougir le test.
 */
class AutorisationDesCanauxTest extends ApiTestCase
{
    use RefreshDatabase;
    use SessionsDImpersonation;

    private const CLE = 'cle-de-test';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => self::CLE,
            'broadcasting.connections.reverb.secret' => 'secret-de-test',
            'broadcasting.connections.reverb.app_id' => '1',
            'broadcasting.connections.reverb.options.host' => '127.0.0.1',
            'broadcasting.connections.reverb.options.port' => 1,
            'broadcasting.connections.reverb.options.scheme' => 'http',
            'broadcasting.connections.reverb.options.useTLS' => false,
        ]);
        $this->app->make(BroadcastManager::class)->forgetDrivers();
        require base_path('routes/channels.php');
    }

    /**
     * Un type du registre → une fermeture qui rend `[objet, lecteur, non-lecteur]`.
     *
     * @return array<string, Closure(): array{0: Model, 1: User, 2: User}>
     */
    private function fixtures(): array
    {
        return [
            'conversation' => function (): array {
                $fil = Conversation::factory()->create();
                $lecteur = User::factory()->create();
                $fil->participants()->attach($lecteur->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

                return [$fil, $lecteur, User::factory()->create()];
            },
        ];
    }

    public function test_chaque_type_du_registre_a_sa_fixture(): void
    {
        $this->assertNotEmpty(CanauxTempsReel::types());
        $this->assertSame([], array_values(array_diff(array_keys(CanauxTempsReel::types()), array_keys($this->fixtures()))), 'un type du registre n\'a pas de lecteur ni de non-lecteur ici');
    }

    public function test_chaque_type_refuse_le_non_lecteur_et_ouvre_au_lecteur_en_prive_comme_en_presence(): void
    {
        foreach (CanauxTempsReel::types() as $type => $entree) {
            [$objet, $lecteur, $nonLecteur] = ($this->fixtures()[$type])();
            $canal = "sujet.{$type}.{$objet->getKey()}";

            foreach (['private', 'presence'] as $prefixe) {
                $this->autoriser($nonLecteur, "{$prefixe}-{$canal}")->assertForbidden();
                $reponse = $this->autoriser($lecteur, "{$prefixe}-{$canal}")->assertOk();
                $this->assertStringStartsWith(self::CLE.':', (string) $reponse->json('auth'), "{$prefixe}-{$canal} : témoin positif");
            }
        }
    }

    public function test_la_presence_ne_publie_que_l_identifiant(): void
    {
        [$fil, $lecteur] = ($this->fixtures()['conversation'])();

        $donnees = json_decode((string) $this->autoriser($lecteur, "presence-sujet.conversation.{$fil->id}")->assertOk()->json('channel_data'), true);

        $this->assertSame((string) $lecteur->id, (string) $donnees['user_id']);
        $this->assertSame(['id' => $lecteur->id], $donnees['user_info']);
    }

    public function test_le_canal_personnel_n_ouvre_qu_a_soi(): void
    {
        $moi = User::factory()->create();
        $autre = User::factory()->create();

        $this->assertStringStartsWith(self::CLE.':', (string) $this->autoriser($moi, "private-utilisateur.{$moi->id}")->assertOk()->json('auth'));
        $this->autoriser($moi, "private-utilisateur.{$autre->id}")->assertForbidden();
    }

    public function test_un_type_hors_registre_ou_un_identifiant_sans_modele_est_refuse(): void
    {
        [$fil, $lecteur] = ($this->fixtures()['conversation'])();
        $this->autoriser($lecteur, "private-sujet.conversation.{$fil->id}")->assertOk();

        foreach ([
            "private-sujet.inconnu.{$fil->id}",
            "private-sujet.App\\Models\\Conversation.{$fil->id}",
            "private-sujet.Conversation.{$fil->id}",
            'private-sujet.conversation.'.($fil->id + 100000),
            'private-sujet.conversation.abc',
            'private-sujet.conversation.0',
            'private-sujet.conversation.99999999999999999999999',
            "private-App.Models.User.{$lecteur->id}",
        ] as $canal) {
            $this->autoriser($lecteur, $canal)->assertForbidden();
        }
    }

    public function test_sans_jeton_401(): void
    {
        $this->postJson('/api/broadcasting/auth', ['channel_name' => 'private-utilisateur.1', 'socket_id' => '1234.5678'])->assertUnauthorized();
    }

    /**
     * ADR-0129 § 4 — sous impersonation, aucune autorisation, y compris le canal personnel de la cible. Le
     * `POST` est refusé par `EnforceImpersonationReadOnly` (méthode non sûre) ; le `GET`, que
     * `Broadcast::routes()` sert aussi et que ce middleware laisse passer, par `CanauxTempsReel`.
     */
    public function test_sous_impersonation_403_quel_que_soit_le_verbe(): void
    {
        ['cible' => $cible, 'jeton' => $jeton] = $this->ouvrirUneSession();
        $fil = Conversation::factory()->create();
        $fil->participants()->attach($cible->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        foreach (["private-utilisateur.{$cible->id}", "private-sujet.conversation.{$fil->id}", "presence-sujet.conversation.{$fil->id}"] as $canal) {
            $corps = ['channel_name' => $canal, 'socket_id' => '1234.5678'];
            $this->avecLeJeton($jeton)->postJson('/api/broadcasting/auth', $corps)->assertForbidden();
            $this->avecLeJeton($jeton)->getJson('/api/broadcasting/auth?'.http_build_query($corps))->assertForbidden();
        }

        // Témoin : la cible elle-même, avec son propre jeton, est autorisée sur les deux verbes.
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $corps = ['channel_name' => "private-utilisateur.{$cible->id}", 'socket_id' => '1234.5678'];
        $this->actingAs($cible, 'sanctum')->postJson('/api/broadcasting/auth', $corps)->assertOk();
        $this->actingAs($cible, 'sanctum')->getJson('/api/broadcasting/auth?'.http_build_query($corps))->assertOk();
    }

    public function test_l_ancienne_route_du_groupe_web_n_existe_plus(): void
    {
        $moi = User::factory()->create();

        $this->actingAs($moi, 'sanctum')->post('/broadcasting/auth', ['channel_name' => "private-utilisateur.{$moi->id}", 'socket_id' => '1234.5678'])->assertNotFound();
    }

    private function autoriser(User $user, string $canal): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->actingAs($user, 'sanctum')->postJson('/api/broadcasting/auth', ['channel_name' => $canal, 'socket_id' => '1234.5678']);
    }
}
