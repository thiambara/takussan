<?php

namespace Tests\Feature\Search;

use App\Jobs\SendSavedSearchAlerts;
use App\Models\Address;
use App\Models\AlertSubscriber;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\WhatsappContact;
use App\Services\Model\SearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
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

    /** **AC17** — au plus cinq alertes ouvertes par contact : la sixième n'est pas créée, en silence. */
    public function test_cinq_alertes_au_plus_par_contact(): void
    {
        foreach (range(1, 6) as $i) {
            // Une heure entre deux demandes : la borne est celle des alertes OUVERTES, pas le
            // limiteur par contact (cinq par heure), éprouvé à part.
            $this->travel(61)->minutes();
            $this->postJson('/api/public/search-alerts', $this->demande(['name' => "Alerte {$i}", 'email' => strtoupper(self::EMAIL)]))->assertStatus(202);
        }

        $this->assertSame(5, AlertSubscriber::count(), 'la casse ne fait pas un nouveau contact');
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
