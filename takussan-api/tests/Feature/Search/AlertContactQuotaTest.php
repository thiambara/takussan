<?php

namespace Tests\Feature\Search;

use App\Jobs\RecordPublicSearchAlert;
use App\Models\AlertSubscriber;
use App\Models\SavedSearch;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

/**
 * TCK-615 **AC4** (ADR-0050, amendement du 2026-11-16, C) — un tiers n'épuise plus l'abonnement
 * d'un contact. Avec des adresses IP tournantes, il remplissait les 5 demandes ouvertes d'une boîte
 * pendant 48 h, et le titulaire ne pouvait plus s'abonner, sans le savoir. La borne ne retient plus
 * que les demandes confirmées ; à 5 demandes muettes, la nouvelle évince la plus ancienne dont aucun
 * message de confirmation n'est parti depuis 24 h.
 */
class AlertContactQuotaTest extends TestCase
{
    use RefreshDatabase;

    private const CIBLE = 'cible@exemple.sn';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function demander(string $ip, string $nom, string $email = self::CIBLE)
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson('/api/public/search-alerts', [
            'criteria' => ['price_max' => 200_000], 'name' => $nom, 'frequency' => 'daily',
            'channel' => 'email', 'email' => $email, 'locale' => 'fr', 'consent' => true,
        ]);
    }

    /** @return list<Email> */
    private function confirmationsA(string $adresse): array
    {
        return collect(app('mailer')->getSymfonyTransport()->messages())
            ->map(fn (SentMessage $m) => $m->getOriginalMessage())
            ->filter(fn (Email $e) => collect($e->getTo())->contains(fn ($a) => $a->getAddress() === $adresse))
            ->values()
            ->all();
    }

    /**
     * **AC4** — cinq demandes non confirmées pour `cible@` depuis cinq IP ; le titulaire demande et
     * confirme : son abonnement est actif, et la réponse HTTP est identique dans tous les cas.
     */
    public function test_le_titulaire_s_abonne_malgre_cinq_demandes_d_un_tiers(): void
    {
        $this->freezeTime();
        $reponses = [];
        foreach (range(1, 5) as $i) {
            $reponses[] = $this->demander("10.9.0.{$i}", "Tiers {$i}");
        }
        $this->assertSame(5, AlertSubscriber::count());

        // Le plafond de 2 confirmations par 24 h (que le tiers a épuisé) est une autre borne,
        // inchangée : le titulaire revient le lendemain, ses 5 demandes muettes toujours là (48 h).
        $this->travel(25)->hours();
        $reponses[] = $this->demander('10.9.1.1', 'Ma vraie alerte');

        $mails = $this->confirmationsA(self::CIBLE);
        $this->assertCount(3, $mails, 'deux pour le tiers, une pour le titulaire');
        preg_match('/search-alerts\/confirm\?token=([A-Za-z0-9_-]+)/', (string) end($mails)->getHtmlBody(), $m);
        $this->postJson('/api/public/search-alerts/confirm', ['token' => $m[1]])->assertOk();

        $vraie = SavedSearch::query()->where('name', 'Ma vraie alerte')->sole();
        $this->assertTrue($vraie->alertSubscriber->isConfirmed(), 'l\'abonnement du titulaire est actif');
        $this->assertSame(5, AlertSubscriber::count(), 'une demande muette a été évincée');
        $this->assertNull(SavedSearch::query()->where('name', 'Tiers 1')->first(), 'la plus ancienne, son message parti depuis plus de 24 h, est évincée avec sa recherche');
        $this->assertNotNull(SavedSearch::query()->where('name', 'Tiers 2')->first());

        $premiere = $reponses[0];
        foreach ($reponses as $reponse) {
            $this->assertSame(202, $reponse->getStatusCode());
            $this->assertSame($premiere->json(), $reponse->json());
        }
    }

    /**
     * L'éviction ne rend pas le plafond de confirmations au tiers : une demande dont le message est
     * parti depuis moins de 24 h n'est jamais évincée. Une demande par heure pendant 24 h : deux
     * messages au plus sur la journée.
     */
    public function test_l_eviction_ne_rouvre_pas_le_plafond_de_confirmations(): void
    {
        $this->freezeTime();
        foreach (range(1, 24) as $i) {
            $this->demander("10.8.0.{$i}", "Tiers {$i}")->assertStatus(202);
            $this->travel(61)->minutes();
        }

        $this->assertCount(2, $this->confirmationsA(self::CIBLE), 'deux messages par 24 h, éviction ou non');
        $this->assertSame(5, AlertSubscriber::count());
    }

    /** À 5 demandes CONFIRMÉES, une demande neuve se tait : rien n'est créé, rien n'est évincé. */
    public function test_cinq_alertes_confirmees_ferment_le_contact(): void
    {
        foreach (range(1, 5) as $i) {
            $this->travel(61)->minutes();
            $this->demander("10.7.0.{$i}", "Confirmée {$i}");
        }
        AlertSubscriber::query()->update(['confirmed_at' => now()]);
        $this->travel(25)->hours();

        $this->demander('10.7.1.1', 'Une de trop')->assertStatus(202);

        $this->assertSame(5, AlertSubscriber::count());
        $this->assertSame(5, AlertSubscriber::query()->whereNotNull('confirmed_at')->count());
        $this->assertNull(SavedSearch::query()->where('name', 'Une de trop')->first());
    }

    /**
     * Plusieurs workers : compter, évincer et créer se font sous un verrou par boîte. Tant qu'un
     * autre worker le tient, la demande n'écrit rien (elle se journalise, sans contact).
     */
    public function test_le_verrou_par_boite_serialise_les_workers(): void
    {
        $journal = [];
        Event::listen(MessageLogged::class, function (MessageLogged $e) use (&$journal): void {
            $journal[] = $e;
        });
        config(['search_alerts.contact_lock_wait_seconds' => 0]);
        $boite = AlertSubscriber::mailboxHash(AlertSubscriber::CHANNEL_EMAIL, self::CIBLE);
        $verrou = Cache::lock(RecordPublicSearchAlert::verrouDeLaBoite($boite), 30);
        $this->assertTrue($verrou->get());

        (new RecordPublicSearchAlert(['criteria' => [], 'frequency' => 'daily', 'locale' => 'fr'], 'email', self::CIBLE))->handle(app(PhoneVerificationService::class));
        $this->assertSame(0, AlertSubscriber::count(), 'un autre worker tient la boîte');
        $this->assertNotEmpty($journal);
        foreach ($journal as $ligne) {
            $this->assertStringNotContainsString(self::CIBLE, json_encode($ligne->context).$ligne->message);
        }

        $verrou->release();
        (new RecordPublicSearchAlert(['criteria' => [], 'frequency' => 'daily', 'locale' => 'fr'], 'email', self::CIBLE))->handle(app(PhoneVerificationService::class));
        $this->assertSame(1, AlertSubscriber::count());
    }
}
