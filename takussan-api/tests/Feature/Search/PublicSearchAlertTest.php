<?php

namespace Tests\Feature\Search;

use App\Jobs\RecordPublicSearchAlert;
use App\Jobs\SendSavedSearchAlerts;
use App\Models\Address;
use App\Models\AlertSubscriber;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use App\Models\WhatsappContact;
use App\Services\Auth\PhoneVerificationService;
use App\Services\Model\SearchService;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mime\Email;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-599 (ADR-0050 §4) — l'alerte sans compte : **AC16** (rien avant la double confirmation),
 * **AC17** (aucune énumération, bornes, purge), **AC18** (désinscription qui ne cède qu'à un POST).
 */
class PublicSearchAlertTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const EMAIL = 'awa@exemple.sn';

    private const PHONE = '+221771234567';

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $this->sms = FakeSmsRouter::install();
    }

    /** @return array<string, mixed> */
    private function demande(array $surcharges = []): array
    {
        return [
            'criteria' => ['city' => 'Dakar', 'price_max' => 300000],
            'name' => 'Dakar abordable',
            'frequency' => 'daily',
            'channel' => 'email',
            'email' => self::EMAIL,
            'locale' => 'fr',
            'consent' => true,
            ...$surcharges,
        ];
    }

    /** @return list<Email> */
    private function emailsA(string $adresse): array
    {
        return collect(app('mailer')->getSymfonyTransport()->messages())
            ->map(fn (SentMessage $m) => $m->getOriginalMessage())
            ->filter(fn (Email $e) => collect($e->getTo())->contains(fn ($a) => $a->getAddress() === $adresse))
            ->values()
            ->all();
    }

    private function jetonDuDernierEmail(string $adresse): string
    {
        $mails = $this->emailsA($adresse);
        $this->assertNotEmpty($mails, 'aucun e-mail de confirmation');
        preg_match('/search-alerts\/confirm\?token=([A-Za-z0-9_-]+)/', (string) end($mails)->getHtmlBody(), $m);
        $this->assertNotEmpty($m[1] ?? null, 'le lien de confirmation porte le jeton');

        return $m[1];
    }

    private function bienCorrespondant(): Property
    {
        $bien = Property::factory()->published()->create(['price' => 250_000, 'published_at' => now()->subDay()]);
        Address::create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'city' => 'Dakar', 'neighborhood' => 'Plateau', 'country' => 'SN']);
        $this->indexProperties();

        return $bien;
    }

    private function lancerLeJob(): void
    {
        (new SendSavedSearchAlerts)->handle(app(SearchService::class));
    }

    /** Le nombre d'alertes (hors confirmation) reçues par l'adresse. */
    private function alertesRecues(string $adresse): int
    {
        return collect($this->emailsA($adresse))->filter(fn (Email $e) => str_contains((string) $e->getSubject(), 'Dakar abordable'))->count();
    }

    /** **AC16 (e-mail)** — rien avant la confirmation ; le lien confirme une fois, jamais deux. */
    public function test_rien_ne_part_avant_la_confirmation_et_le_jeton_ne_sert_qu_une_fois(): void
    {
        $this->freezeTime();
        $this->bienCorrespondant();

        $this->postJson('/api/public/search-alerts', $this->demande())->assertStatus(202);
        $this->assertCount(1, $this->emailsA(self::EMAIL), 'le seul message : la confirmation');

        $this->lancerLeJob();
        $this->assertSame(0, $this->alertesRecues(self::EMAIL), 'non confirmée : aucune alerte');

        $jeton = $this->jetonDuDernierEmail(self::EMAIL);
        $this->postJson('/api/public/search-alerts/confirm', ['token' => $jeton])->assertOk();
        $this->postJson('/api/public/search-alerts/confirm', ['token' => $jeton])
            ->assertStatus(422)->assertJsonPath('code', 'search_alert.invalid_token');

        $this->lancerLeJob();
        $this->assertSame(1, $this->alertesRecues(self::EMAIL), 'confirmée : l\'alerte part');
    }

    /** **AC16** — un lien de confirmation vaut 48 h, même quand la purge n'est pas encore passée. */
    public function test_un_jeton_de_plus_de_48_h_ne_confirme_rien(): void
    {
        $this->freezeTime();
        $this->postJson('/api/public/search-alerts', $this->demande())->assertStatus(202);
        $jeton = $this->jetonDuDernierEmail(self::EMAIL);

        $this->travel(49)->hours();
        $this->postJson('/api/public/search-alerts/confirm', ['token' => $jeton])
            ->assertStatus(422)->assertJsonPath('code', 'search_alert.invalid_token');
        $this->assertNull(AlertSubscriber::sole()->confirmed_at);
    }

    /** Le contact et les jetons ne sont jamais en clair en base. */
    public function test_le_contact_est_chiffre_et_les_jetons_haches(): void
    {
        $this->postJson('/api/public/search-alerts', $this->demande())->assertStatus(202);
        $jeton = $this->jetonDuDernierEmail(self::EMAIL);

        $brut = json_encode(DB::table('alert_subscribers')->first());
        $this->assertStringNotContainsString('awa@', $brut);
        $this->assertStringNotContainsString($jeton, $brut);
        $this->assertSame(self::EMAIL, AlertSubscriber::sole()->contact);
    }

    /**
     * **AC16 (WhatsApp)** — derrière son drapeau seulement ; cinq codes faux épuisent la demande,
     * même le bon code est alors refusé ; une demande confirmée écrit `whatsapp_contacts` en
     * `opted_in`.
     */
    public function test_la_confirmation_whatsapp_par_code(): void
    {
        $this->postJson('/api/public/search-alerts', $this->demande(['channel' => 'whatsapp', 'phone' => self::PHONE]))
            ->assertUnprocessable()->assertJsonValidationErrors('channel');
        $this->getJson('/api/public/search-alerts/capabilities')->assertExactJson(['data' => ['channels' => ['email']]]);

        config(['search_alerts.whatsapp_enabled' => true]);
        $this->getJson('/api/public/search-alerts/capabilities')->assertExactJson(['data' => ['channels' => ['email', 'whatsapp']]]);

        $this->postJson('/api/public/search-alerts', $this->demande(['channel' => 'whatsapp', 'phone' => self::PHONE]))->assertStatus(202);
        $bon = $this->sms->lastCodeFor(self::PHONE);
        $faux = $bon === '000000' ? '111111' : '000000';
        foreach (range(1, 5) as $_) {
            $this->postJson('/api/public/search-alerts/confirm', ['phone' => self::PHONE, 'code' => $faux])->assertStatus(422);
        }
        $this->postJson('/api/public/search-alerts/confirm', ['phone' => self::PHONE, 'code' => $bon])
            ->assertStatus(422)->assertJsonPath('code', 'search_alert.invalid_code');
        $this->assertNull(AlertSubscriber::sole()->confirmed_at);

        $this->travel(2)->minutes();
        $this->postJson('/api/public/search-alerts', $this->demande(['channel' => 'whatsapp', 'phone' => self::PHONE, 'name' => 'Seconde']))->assertStatus(202);
        $this->postJson('/api/public/search-alerts/confirm', ['phone' => self::PHONE, 'code' => $this->sms->lastCodeFor(self::PHONE)])->assertOk();

        $this->assertSame(1, AlertSubscriber::whereNotNull('confirmed_at')->count());
        $this->assertSame(WhatsappContact::OPT_IN_OPTED_IN, WhatsappContact::where('phone', self::PHONE)->sole()->opt_in_status);
    }

    /** Demande WhatsApp confirmée par code, puis désinscription par le jeton de l'abonné. */
    private function abonnementWhatsappPuisDesinscription(): void
    {
        config(['search_alerts.whatsapp_enabled' => true]);
        $this->postJson('/api/public/search-alerts', $this->demande(['channel' => 'whatsapp', 'phone' => self::PHONE]))->assertStatus(202);
        $this->postJson('/api/public/search-alerts/confirm', ['phone' => self::PHONE, 'code' => $this->sms->lastCodeFor(self::PHONE)])->assertOk();

        $this->postJson('/api/public/search-alerts/unsubscribe', ['token' => AlertSubscriber::sole()->unsubscribe_token])->assertOk();
        $this->assertSame(0, AlertSubscriber::count());
    }

    /** verif-599 m3 — sans compte ni message reçu, le numéro quitte `whatsapp_contacts`. */
    public function test_la_desinscription_whatsapp_efface_le_numero(): void
    {
        $this->abonnementWhatsappPuisDesinscription();

        $this->assertFalse(WhatsappContact::query()->where('phone', self::PHONE)->exists());
    }

    /** verif-599 m3 — rattaché à un compte, le numéro reste, mais le consentement de l'alerte tombe. */
    public function test_la_desinscription_whatsapp_retire_le_consentement_qu_elle_avait_pose(): void
    {
        $user = User::factory()->create(['phone' => self::PHONE]);
        WhatsappContact::create(['phone' => self::PHONE, 'user_id' => $user->id, 'opt_in_status' => WhatsappContact::OPT_IN_PENDING]);

        $this->abonnementWhatsappPuisDesinscription();

        $this->assertSame(WhatsappContact::OPT_IN_OPTED_OUT, WhatsappContact::query()->where('phone', self::PHONE)->sole()->opt_in_status);
    }

    /** verif-599 m3 — un consentement donné ailleurs n'est ni réécrit par l'alerte, ni retiré avec elle. */
    public function test_la_desinscription_whatsapp_garde_un_consentement_venu_d_ailleurs(): void
    {
        WhatsappContact::create(['phone' => self::PHONE, 'opt_in_status' => WhatsappContact::OPT_IN_OPTED_IN, 'opt_in_source' => 'account_settings']);

        $this->abonnementWhatsappPuisDesinscription();

        $contact = WhatsappContact::query()->where('phone', self::PHONE)->sole();
        $this->assertSame(WhatsappContact::OPT_IN_OPTED_IN, $contact->opt_in_status);
        $this->assertSame('account_settings', $contact->opt_in_source);
    }

    /**
     * **AC17** — la réponse ne dit rien du contact : même statut et même corps, connu ou non, borne
     * atteinte ou non ; un troisième message de confirmation en 24 h n'est pas envoyé.
     */
    public function test_aucune_enumeration_et_deux_confirmations_par_jour(): void
    {
        $premiere = $this->postJson('/api/public/search-alerts', $this->demande());
        $connu = $this->postJson('/api/public/search-alerts', $this->demande(['name' => 'Deux']));
        $troisieme = $this->postJson('/api/public/search-alerts', $this->demande(['name' => 'Trois']));
        $inconnu = $this->postJson('/api/public/search-alerts', $this->demande(['email' => 'inconnu@exemple.sn']));

        foreach ([$connu, $troisieme, $inconnu] as $reponse) {
            $this->assertSame($premiere->getStatusCode(), $reponse->getStatusCode());
            $this->assertSame($premiere->json(), $reponse->json());
        }
        $this->assertSame(202, $premiere->getStatusCode());
        $this->assertCount(2, $this->emailsA(self::EMAIL), 'deux confirmations au plus par 24 h');
        $this->assertCount(1, $this->emailsA('inconnu@exemple.sn'));
    }

    /** Un abonné posé directement en base : l'état de départ d'un cas, sans passer par la route. */
    private function abonne(string $email, bool $confirme = false): AlertSubscriber
    {
        $desinscription = AlertSubscriber::newToken();

        return AlertSubscriber::create([
            'channel' => AlertSubscriber::CHANNEL_EMAIL,
            'contact' => $email,
            'contact_hash' => AlertSubscriber::contactHash(AlertSubscriber::CHANNEL_EMAIL, $email),
            'locale' => 'fr',
            'confirmed_at' => $confirme ? now() : null,
            'unsubscribe_token' => $desinscription,
            'unsubscribe_token_hash' => AlertSubscriber::tokenHash($desinscription),
            'consent_at' => now(),
            'consent_source' => 'public_search_alert',
            'consent_version' => AlertSubscriber::CONSENT_VERSION,
        ]);
    }

    /**
     * **AC17**, le temps de réponse — la requête ne fait RIEN qui dépende du contact : ni
     * compte, ni écriture, ni envoi. Les quatre états d'un contact — neuf, connu, à sa borne,
     * déjà confirmé — et le canal WhatsApp poussent chacun le même job chiffré et rendent le même
     * 202, sans qu'un e-mail ni un SMS soit parti ; c'est le worker qui décide et envoie.
     */
    public function test_la_requete_ne_fait_que_pousser_un_job_chiffre(): void
    {
        $this->abonne('connu@exemple.sn');
        foreach (range(1, 5) as $i) {
            $this->abonne(self::EMAIL);
        }
        $this->abonne('confirme@exemple.sn', confirme: true);
        $avant = AlertSubscriber::count();

        config(['search_alerts.whatsapp_enabled' => true]);
        Queue::fake();
        Notification::fake();

        $cas = [
            'neuf@exemple.sn' => $this->demande(['email' => 'neuf@exemple.sn']),
            'connu@exemple.sn' => $this->demande(['email' => 'connu@exemple.sn']),
            self::EMAIL => $this->demande(),
            'confirme@exemple.sn' => $this->demande(['email' => 'confirme@exemple.sn']),
            self::PHONE => $this->demande(['channel' => 'whatsapp', 'email' => null, 'phone' => self::PHONE]),
        ];
        // verif-599 m7 — l'affirmation qui tient : AUCUNE requête SQL de la requête HTTP ne lit ni
        // n'écrit les tables du contact. Un compte (`forContact()->count()`) ou une écriture
        // réservée au contact connu ne change ni le corps, ni la file, ni le nombre de lignes ;
        // ils se voient ici.
        $requetes = [];
        DB::listen(function (QueryExecuted $q) use (&$requetes): void {
            $requetes[] = $q->sql;
        });
        $reponses = array_map(fn (array $demande) => $this->postJson('/api/public/search-alerts', $demande), $cas);
        $touchees = array_values(array_filter($requetes, fn (string $sql) => preg_match('/\b(alert_subscribers|saved_searches)\b/', $sql) === 1));
        $this->assertSame([], $touchees, 'la requête HTTP ne touche pas les tables du contact');

        $premiere = reset($reponses);
        foreach ($reponses as $contact => $reponse) {
            $reponse->assertStatus(202);
            $this->assertSame($premiere->json(), $reponse->json(), $contact);
            Queue::assertPushed(RecordPublicSearchAlert::class, fn (RecordPublicSearchAlert $job) => $job->contact === $contact
                && $job instanceof ShouldBeEncrypted);
        }
        Queue::assertPushed(RecordPublicSearchAlert::class, count($cas));
        // `dispatchSync()` passe AUSSI par la file simulée, sur la connexion `sync` : c'est elle
        // qui trahirait un travail fait pendant la requête en production.
        Queue::assertNotPushed(RecordPublicSearchAlert::class, fn (RecordPublicSearchAlert $job) => $job->connection === 'sync');
        Notification::assertNothingSent();
        $this->assertSame([], app('mailer')->getSymfonyTransport()->messages()->all());
        $this->assertSame([], $this->sms->sentTo(self::PHONE));
        $this->assertSame($avant, AlertSubscriber::count(), 'aucune écriture dans la requête');
    }

    /** Le job qui échoue se journalise sans contact ni message, et ne relance pas l'erreur. */
    public function test_l_echec_du_job_ne_journalise_pas_le_contact(): void
    {
        $journal = [];
        Event::listen(MessageLogged::class, function (MessageLogged $e) use (&$journal): void {
            $journal[] = $e;
        });
        AlertSubscriber::creating(fn () => throw new \RuntimeException('refus pour '.self::EMAIL));

        (new RecordPublicSearchAlert(['criteria' => [], 'frequency' => 'daily', 'locale' => 'fr'], 'email', self::EMAIL))
            ->handle(app(PhoneVerificationService::class));

        $echecs = array_values(array_filter($journal, fn (MessageLogged $e) => $e->message === 'search_alert.request_failed'));
        $this->assertCount(1, $echecs);
        $this->assertStringNotContainsString(self::EMAIL, json_encode($echecs[0]->context));
        $this->assertSame(0, AlertSubscriber::count());
    }

    /** **AC17** — au plus cinq alertes ouvertes par contact : la sixième n'est pas créée, en silence. */
    public function test_cinq_alertes_au_plus_par_contact(): void
    {
        foreach (range(1, 6) as $i) {
            // Une heure entre deux demandes : la borne est celle des alertes OUVERTES, pas le
            // limiteur par contact (cinq par heure), éprouvé à part.
            $this->travel(61)->minutes();
            // verif-599 m5 (A19) — casses ALTERNÉES : une seule casse répétée n'éprouvait rien.
            $email = $i % 2 === 0 ? strtoupper(self::EMAIL) : self::EMAIL;
            $this->postJson('/api/public/search-alerts', $this->demande(['name' => "Alerte {$i}", 'email' => $email]))->assertStatus(202);
        }

        $this->assertSame(5, AlertSubscriber::count(), 'la casse ne fait pas un nouveau contact');
    }

    /**
     * verif-599 m1 — les alias `+` arrivent dans la même boîte : ils partagent ses plafonds (2
     * confirmations par 24 h, 5 alertes ouvertes) et son limiteur. Le contact stocké reste celui
     * saisi.
     */
    public function test_les_alias_plus_partagent_les_plafonds_de_la_boite(): void
    {
        $alias = ['awa@exemple.sn', 'awa+1@exemple.sn', 'awa+2@exemple.sn', 'Awa+3@exemple.sn', 'awa+4@exemple.sn', 'awa+5@exemple.sn'];
        foreach ($alias as $i => $adresse) {
            $this->travel(61)->minutes();
            $this->withServerVariables(['REMOTE_ADDR' => "10.0.1.{$i}"])
                ->postJson('/api/public/search-alerts', $this->demande(['name' => "Alias {$i}", 'email' => $adresse]))->assertStatus(202);
        }

        $recues = array_sum(array_map(fn (string $a) => count($this->emailsA(strtolower($a))), $alias));
        $this->assertSame(2, $recues, 'deux confirmations au plus par boîte et par 24 h');
        $this->assertSame(5, AlertSubscriber::count(), 'cinq alertes ouvertes au plus par boîte');
        $this->assertSame('awa+1@exemple.sn', AlertSubscriber::query()->orderBy('id')->skip(1)->first()->contact, 'le contact reste celui saisi');
    }

    public function test_le_limiteur_par_contact_compte_les_alias_ensemble(): void
    {
        $statuts = [];
        foreach (range(1, 6) as $i) {
            $statuts[] = $this->withServerVariables(['REMOTE_ADDR' => "10.0.2.{$i}"])
                ->postJson('/api/public/search-alerts', $this->demande(['name' => "N{$i}", 'email' => "awa+{$i}@exemple.sn"]))->getStatusCode();
        }

        $this->assertSame([202, 202, 202, 202, 202, 429], $statuts);
    }

    /**
     * verif-599 m2 — les en-têtes du limiteur ne disent rien du contact : depuis une adresse IP
     * neuve, viser un contact qu'une autre personne vient de viser rend les MÊMES en-têtes que
     * viser un contact vierge.
     */
    public function test_les_en_tetes_du_limiteur_ne_trahissent_pas_le_contact(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.9'])
            ->postJson('/api/public/search-alerts', $this->demande())->assertStatus(202);

        $connu = $this->withServerVariables(['REMOTE_ADDR' => '10.0.3.1'])
            ->postJson('/api/public/search-alerts', $this->demande(['name' => 'Sonde']));
        $vierge = $this->withServerVariables(['REMOTE_ADDR' => '10.0.3.2'])
            ->postJson('/api/public/search-alerts', $this->demande(['name' => 'Sonde', 'email' => 'vierge@exemple.sn']));

        foreach (['X-RateLimit-Limit', 'X-RateLimit-Remaining'] as $entete) {
            $this->assertNotNull($connu->headers->get($entete), $entete);
            $this->assertSame($vierge->headers->get($entete), $connu->headers->get($entete), $entete);
        }
    }

    /** **AC17** — le limiteur rend 429 au-delà de sa borne (par visiteur). */
    public function test_le_limiteur_rend_429(): void
    {
        $statuts = [];
        foreach (range(1, 11) as $i) {
            $statuts[] = $this->postJson('/api/public/search-alerts', $this->demande(['email' => "visiteur{$i}@exemple.sn"]))->getStatusCode();
        }

        $this->assertSame(array_fill(0, 10, 202), array_slice($statuts, 0, 10));
        $this->assertSame(429, $statuts[10]);
    }

    /** **AC17** — le limiteur compte aussi par CONTACT : changer d'adresse IP ne martèle pas une boîte. */
    public function test_le_limiteur_compte_par_contact_quelle_que_soit_l_adresse_ip(): void
    {
        $statuts = [];
        foreach (range(1, 6) as $i) {
            $statuts[] = $this->withServerVariables(['REMOTE_ADDR' => "10.0.0.{$i}"])
                ->postJson('/api/public/search-alerts', $this->demande(['name' => "N{$i}"]))->getStatusCode();
        }

        $this->assertSame([202, 202, 202, 202, 202, 429], $statuts);
    }

    /** **AC17** — une demande non confirmée a disparu après 48 h, avec sa recherche. */
    public function test_une_demande_non_confirmee_est_purgee_a_48_h(): void
    {
        $this->freezeTime();
        $this->postJson('/api/public/search-alerts', $this->demande())->assertStatus(202);
        $this->postJson('/api/public/search-alerts', $this->demande(['email' => 'confirme@exemple.sn']))->assertStatus(202);
        $this->postJson('/api/public/search-alerts/confirm', ['token' => $this->jetonDuDernierEmail('confirme@exemple.sn')])->assertOk();

        $this->travel(47)->hours();
        $this->artisan('search-alerts:purge-unconfirmed')->assertSuccessful();
        $this->assertSame(2, AlertSubscriber::count(), 'avant 48 h : rien n\'est purgé');

        $this->travel(2)->hours();
        $this->artisan('search-alerts:purge-unconfirmed')->assertSuccessful();

        $this->assertSame(1, AlertSubscriber::count());
        $this->assertNotNull(AlertSubscriber::sole()->confirmed_at, 'seule la demande confirmée reste');
        $this->assertSame(1, SavedSearch::count(), 'la recherche purgée part avec sa demande');
    }

    /**
     * **AC18** — l'alerte porte `List-Unsubscribe-Post` ; un GET ne désinscrit pas ; le POST du
     * jeton efface TOUTES les demandes du contact et leurs recherches, et ne sert qu'une fois.
     */
    public function test_la_desinscription_efface_le_contact_et_ne_cede_qu_a_un_post(): void
    {
        $this->freezeTime();
        $this->bienCorrespondant();
        $this->postJson('/api/public/search-alerts', $this->demande())->assertStatus(202);
        $this->postJson('/api/public/search-alerts/confirm', ['token' => $this->jetonDuDernierEmail(self::EMAIL)])->assertOk();
        $this->travel(2)->minutes();
        $this->postJson('/api/public/search-alerts', $this->demande(['name' => 'Autre']))->assertStatus(202);
        $this->postJson('/api/public/search-alerts', $this->demande(['email' => 'voisin@exemple.sn']))->assertStatus(202);

        $this->lancerLeJob();
        $alerte = collect($this->emailsA(self::EMAIL))->first(fn (Email $e) => str_contains((string) $e->getSubject(), 'Dakar abordable'));
        $this->assertNotNull($alerte);
        $this->assertSame('List-Unsubscribe=One-Click', $alerte->getHeaders()->get('List-Unsubscribe-Post')?->getBodyAsString());
        $uri = trim((string) $alerte->getHeaders()->get('List-Unsubscribe')?->getBodyAsString(), '<>');
        $chemin = parse_url($uri, PHP_URL_PATH).'?'.parse_url($uri, PHP_URL_QUERY);
        $this->assertStringContainsString('/'.'fr/search-alerts/unsubscribe?token=', (string) $alerte->getHtmlBody(), 'le lien visible ouvre la page à un bouton');

        $this->getJson($chemin)->assertStatus(405);
        $this->assertSame(3, AlertSubscriber::count(), 'un GET ne désinscrit rien');

        // RFC 8058 : le client POSTe sur l'URI telle quelle, corps `List-Unsubscribe=One-Click`.
        $this->post($chemin, ['List-Unsubscribe' => 'One-Click'])->assertOk();

        $this->assertSame(0, AlertSubscriber::query()->forContact('email', self::EMAIL)->count(), 'toutes les demandes du contact');
        $this->assertSame(1, AlertSubscriber::count(), 'le voisin reste');
        $this->assertSame(1, SavedSearch::count());
        $this->postJson('/api/public/search-alerts/unsubscribe', ['token' => 'inconnu'])->assertOk()->assertJsonPath('data.status', 'unsubscribed');
    }

    /** Le message de confirmation est dans la langue choisie. */
    public function test_la_confirmation_est_dans_la_langue_de_la_demande(): void
    {
        $this->postJson('/api/public/search-alerts', $this->demande(['locale' => 'en']))->assertStatus(202);

        $mail = $this->emailsA(self::EMAIL)[0];
        $this->assertSame(__('saved_search_alerts.confirm.mail.subject', [], 'en'), $mail->getSubject());
        $this->assertStringContainsString('/en/search-alerts/confirm?token=', (string) $mail->getHtmlBody());
    }

    /** Sans consentement, rien n'est créé. */
    public function test_le_consentement_est_exige(): void
    {
        $this->postJson('/api/public/search-alerts', $this->demande(['consent' => false]))
            ->assertUnprocessable()->assertJsonValidationErrors('consent');
        $this->assertSame(0, AlertSubscriber::count());
    }
}
