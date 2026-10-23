<?php

namespace Tests\Feature\Search;

use App\Jobs\SendSavedSearchAlerts;
use App\Models\Address;
use App\Models\AlertSubscriber;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\WhatsappContact;
use App\Services\Model\SearchService;
use App\Services\Notifications\Whatsapp\WhatsappDriverInterface;
use App\Services\Notifications\Whatsapp\WhatsappMessage;
use App\Services\Notifications\Whatsapp\WhatsappResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * P179.02 (TCK-1795) — l'alerte d'un abonné sans compte servie par WhatsApp, son seul canal.
 *
 * `WhatsappChannel` ne lève jamais : un pilote qui échoue rend un `WhatsappResult`. Le `catch` de
 * `SendSavedSearchAlerts`, qui rend la réservation de la fenêtre, ne voyait donc pas l'échec, et
 * les biens de la fenêtre n'étaient plus jamais annoncés. Un échec SÛR rend la réservation ; un
 * échec AMBIGU la garde (Meta a pu recevoir : la reprise doublerait le message).
 */
class SavedSearchWhatsappFailureTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const PHONE = '+221771234567';

    private WhatsappDriverInterface $pilote;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config(['search_alerts.whatsapp_enabled' => true]);

        $this->pilote = new class implements WhatsappDriverInterface
        {
            public ?WhatsappResult $prochain = null;

            public int $appels = 0;

            public function send(array|string $to, WhatsappMessage $message, array $context = []): array
            {
                $this->appels++;
                $to = (string) (is_array($to) ? $to[0] : $to);

                return [$to => $this->prochain ?? WhatsappResult::sent($to, 'faux', 'wamid.'.$this->appels)];
            }

            public function id(): string
            {
                return 'faux';
            }
        };
        $this->app->instance(WhatsappDriverInterface::class, $this->pilote);
    }

    private function rechercheWhatsapp(): SavedSearch
    {
        $bien = Property::factory()->published()->create(['price' => 100_000, 'published_at' => now()->subDay()]);
        Address::create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'city' => 'Dakar', 'country' => 'SN']);

        $abonne = AlertSubscriber::create([
            'channel' => AlertSubscriber::CHANNEL_WHATSAPP,
            'contact' => self::PHONE,
            'contact_hash' => AlertSubscriber::contactHash(AlertSubscriber::CHANNEL_WHATSAPP, self::PHONE),
            'locale' => 'fr',
            'confirmed_at' => now()->subDays(2),
            'unsubscribe_token' => AlertSubscriber::newToken(),
            'unsubscribe_token_hash' => AlertSubscriber::tokenHash('x'),
            'consent_at' => now()->subDays(2),
            'consent_source' => 'public_search_alert',
            'consent_version' => AlertSubscriber::CONSENT_VERSION,
        ]);
        WhatsappContact::create([
            'phone' => self::PHONE,
            'opt_in_status' => WhatsappContact::OPT_IN_OPTED_IN,
            'opt_in_source' => 'public_search_alert',
            'last_inbound_at' => now()->subHour(),
        ]);
        $recherche = SavedSearch::create([
            'alert_subscriber_id' => $abonne->id,
            'name' => 'Abordables',
            'criteria' => ['price_max' => 200_000],
            'notification_frequency' => 'daily',
            'is_active' => true,
        ]);
        $this->indexProperties();

        return $recherche;
    }

    private function lancerLeJob(): void
    {
        (new SendSavedSearchAlerts)->handle(app(SearchService::class));
    }

    public function test_un_echec_whatsapp_sur_rend_la_reservation_et_la_reprise_annonce_la_fenetre(): void
    {
        $this->freezeTime();
        $recherche = $this->rechercheWhatsapp();
        $this->pilote->prochain = WhatsappResult::failed(self::PHONE, 'faux', 'invalid_recipient', ambiguous: false);

        $this->lancerLeJob();
        $this->assertSame(1, $this->pilote->appels, 'le pilote a bien été appelé');
        $this->assertNull($recherche->refresh()->last_notified_at, 'un échec sûr rend la réservation');

        $this->pilote->prochain = null;
        $this->travel(1)->hours(); // dans la fenêtre de service de 24 h
        $this->lancerLeJob();
        $this->assertSame(2, $this->pilote->appels, 'la reprise annonce la fenêtre');
        $this->assertNotNull($recherche->refresh()->last_notified_at);
    }

    public function test_un_echec_whatsapp_ambigu_garde_la_reservation(): void
    {
        $this->freezeTime();
        $recherche = $this->rechercheWhatsapp();
        $this->pilote->prochain = WhatsappResult::failed(self::PHONE, 'faux', 'timeout', ambiguous: true);

        $this->lancerLeJob();
        $this->assertSame(1, $this->pilote->appels);
        $this->assertNotNull($recherche->refresh()->last_notified_at, 'Meta a pu recevoir : pas de reprise');
    }
}
