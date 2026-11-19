<?php

namespace Tests\Feature\Pont;

use App\Models\Message;
use App\Models\MessageRelay;
use App\Models\PropertyContactLead;
use App\Models\WhatsappContact;
use App\Notifications\Channels\WhatsappChannel;
use App\Notifications\Concerns\SupportsWhatsapp;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\SceneDuPont;

/**
 * TCK-2980 (ADR-0132 § 3) — STOP, ARRET, START exacts ; « stop svp » reste un message ; les avis `pont.stop` et
 * `pont.start` en note d'équipe ; le canal d'un message rendu au seul personnel et à son auteur (AC7).
 */
class ConsentementDuPontTest extends ApiTestCase
{
    use RefreshDatabase, SceneDuPont;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLePont();
        $this->ecrireUnMessage('Bonjour', fil: $this->fil);
        // Le bailleur a un relais rattaché à ce fil : c'est là que les avis s'écrivent.
        $this->relaisSortant($this->fil, $this->bailleur, 'wamid.SORTANT-C');
    }

    private function contact(): ?WhatsappContact
    {
        return WhatsappContact::query()->where('phone', self::TEL_BAILLEUR)->first();
    }

    /** AC4 — STOP coupe, START rouvre ; ni message ni prospect. */
    public function test_ac4_stop_puis_start(): void
    {
        $this->recevoir([$this->texte('wamid.S1', self::TEL_BAILLEUR, ' STOP ')])->assertOk();

        $this->assertTrue($this->contact()?->isOptedOut());
        $this->assertSame('pont_stop', $this->contact()?->opt_in_source);
        $this->assertSame(0, Message::query()->where('sender_id', $this->bailleur->id)->count());
        $this->assertSame(0, PropertyContactLead::query()->count());
        $stop = Message::query()->where('conversation_id', $this->fil->id)->where('content', 'pont.stop')->sole();
        $this->assertSame('team', $stop->visibility->value);
        $this->assertSame('system', $stop->type->value);

        $this->recevoir([$this->texte('wamid.S2', self::TEL_BAILLEUR, 'Start')])->assertOk();

        $this->assertSame(WhatsappContact::OPT_IN_OPTED_IN, $this->contact()?->opt_in_status);
        $this->assertSame('pont_start', $this->contact()?->opt_in_source);
        $this->assertSame(1, Message::query()->where('conversation_id', $this->fil->id)->where('content', 'pont.start')->count());
    }

    public function test_arret_accentue_et_ponctue_coupe_aussi(): void
    {
        $this->recevoir([$this->texte('wamid.S3', self::TEL_BAILLEUR, 'Arrêt.')])->assertOk();

        $this->assertTrue($this->contact()?->isOptedOut());
    }

    /** AC4 — un refus qui n'est pas exact est un message ordinaire, versé au fil. */
    public function test_ac4_stop_svp_reste_un_message(): void
    {
        $this->recevoir([$this->texte('wamid.S4', self::TEL_BAILLEUR, 'stop svp')])->assertOk();

        $this->assertFalse((bool) $this->contact()?->isOptedOut());
        $this->assertSame('stop svp', Message::query()->where('sender_id', $this->bailleur->id)->sole()->content);
        $this->assertSame(0, Message::query()->where('content', 'pont.stop')->count());
    }

    /** STOP d'un numéro inconnu : l'opposition est posée, rien d'autre. */
    public function test_stop_d_un_inconnu_ne_cree_rien(): void
    {
        $this->recevoir([$this->texte('wamid.S5', self::TEL_INCONNU, 'STOP')])->assertOk();

        $this->assertTrue(WhatsappContact::query()->where('phone', self::TEL_INCONNU)->sole()->isOptedOut());
        $this->assertSame(0, PropertyContactLead::query()->count());
        $this->assertNull(WhatsappContact::query()->where('phone', self::TEL_INCONNU)->value('user_id'));
    }

    /** Après STOP, le canal des notifications n'envoie plus rien à ce numéro, même dans la fenêtre que le message a ouverte. */
    public function test_les_notifications_respectent_le_stop(): void
    {
        config()->set('whatsapp.default_driver', 'cloud');
        Http::fake(['graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.OK']]], 200), '*' => Http::response([], 200)]);

        // Témoin : le message reçu a ouvert la fenêtre, le texte libre part.
        $this->recevoir([$this->texte('wamid.S6', self::TEL_BAILLEUR, 'Bonjour')])->assertOk();
        app(WhatsappChannel::class)->send($this->bailleur, $this->notification());
        Http::assertSent(fn ($req) => str_contains($req->url(), 'graph.facebook.com'));

        Http::fake(['graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.OK2']]], 200), '*' => Http::response([], 200)]);
        $this->recevoir([$this->texte('wamid.S7', self::TEL_BAILLEUR, 'STOP')])->assertOk();
        app(WhatsappChannel::class)->send($this->bailleur, $this->notification());
        Http::assertNotSent(fn ($req) => str_contains($req->url(), 'graph.facebook.com'));
    }

    /**
     * AC7 — le locataire, lecteur du fil, ne reçoit ni l'avis `pont.stop` ni le `channel` du message du bailleur ;
     * le collègue (personnel de l'agence) reçoit les deux ; le bailleur, auteur, reçoit le canal de son message.
     */
    public function test_ac7_le_canal_et_l_avis_ne_sortent_que_vers_le_personnel(): void
    {
        $this->recevoir([$this->texte('wamid.S8', self::TEL_BAILLEUR, 'Je passe demain.')])->assertOk();
        $this->recevoir([$this->texte('wamid.S9', self::TEL_BAILLEUR, 'STOP')])->assertOk();
        $duBailleur = Message::query()->where('sender_id', $this->bailleur->id)->sole();

        $page = function ($lecteur): array {
            Sanctum::actingAs($lecteur);

            return collect($this->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk()->json('data'))->keyBy('id')->all();
        };

        $locataire = $page($this->locataire);
        $this->assertArrayHasKey($duBailleur->id, $locataire);
        $this->assertArrayNotHasKey('channel', $locataire[$duBailleur->id]);
        $this->assertSame([], array_values(array_filter($locataire, fn ($m) => $m['content'] === 'pont.stop')));
        foreach ($locataire as $m) {
            $this->assertArrayNotHasKey('channel', $m);
        }

        $collegue = $page($this->collegue);
        $this->assertSame('whatsapp', $collegue[$duBailleur->id]['channel']);
        $this->assertCount(1, array_filter($collegue, fn ($m) => $m['content'] === 'pont.stop'));

        $bailleur = $page($this->bailleur);
        $this->assertSame('whatsapp', $bailleur[$duBailleur->id]['channel']);
        $this->assertSame([], array_values(array_filter($bailleur, fn ($m) => $m['content'] === 'pont.stop')));
    }

    /** Le relais entrant de STOP est tracé : un rejeu n'écrit pas un second avis. */
    public function test_un_stop_rejoue_n_ecrit_qu_un_avis(): void
    {
        $this->recevoir([$this->texte('wamid.S10', self::TEL_BAILLEUR, 'STOP')])->assertOk();
        $this->recevoir([$this->texte('wamid.S10', self::TEL_BAILLEUR, 'STOP')])->assertOk();

        $this->assertSame(1, Message::query()->where('content', 'pont.stop')->count());
        $this->assertSame(1, MessageRelay::query()->where('provider_message_id', 'wamid.S10')->count());
    }

    private function notification(): Notification
    {
        return new class extends Notification implements SupportsWhatsapp
        {
            public function via(object $notifiable): array
            {
                return ['whatsapp'];
            }

            public function toWhatsapp(object $notifiable): string
            {
                return 'Votre visite est confirmée.';
            }

            public function whatsappTemplate(object $notifiable): ?WhatsappTemplateRef
            {
                return null;
            }

            public function shouldSendWhatsapp(): bool
            {
                return true;
            }

            public function isCriticalWhatsapp(): bool
            {
                return true;
            }
        };
    }
}
