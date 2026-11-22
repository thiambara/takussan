<?php

namespace Tests\Feature\Search;

use App\Jobs\SendFavoriteChangeAlerts;
use App\Jobs\SendSavedSearchAlerts;
use App\Models\Address;
use App\Models\AppNotification;
use App\Models\Enums\Currency;
use App\Models\Favorite;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use App\Services\Model\SearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Events\NotificationSending;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-615 **AC1** (ADR-0050, amendement du 2026-11-16, A) — un e-mail parti ne repart pas.
 *
 * Jusqu'ici, TOUT échec de `notify()` rendait la réservation, y compris quand l'e-mail était déjà
 * parti et que la cloche, partie en dernier, levait : chaque passage renvoyait l'e-mail (verif-599
 * passe 3, `mails=3 cloches=0`). Décision du porteur : un canal sortant parti, la réservation est
 * gardée et l'alerte perd la cloche. Aucun canal sortant parti : la réservation est rendue.
 */
class AlertSendOnceTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @var array<string, int> les envois réussis, par canal */
    private array $partis = ['mail' => 0, 'database' => 0];

    /** @var list<string> les canaux qui lèvent */
    private array $enPanne = [];

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Event::listen(NotificationSending::class, function (NotificationSending $e): void {
            if (in_array($e->channel, $this->enPanne, true)) {
                throw new RuntimeException("canal {$e->channel} indisponible");
            }
        });
        Event::listen(NotificationSent::class, function (NotificationSent $e): void {
            $this->partis[$e->channel] = ($this->partis[$e->channel] ?? 0) + 1;
        });
    }

    private function rechercheAvecUnBien(User $user): SavedSearch
    {
        $bien = Property::factory()->published()->create([
            'price' => 150_000, 'currency' => Currency::XOF, 'published_at' => now()->subHour(),
        ]);
        Address::create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'city' => 'Dakar', 'neighborhood' => 'Almadies', 'country' => 'SN']);
        $recherche = SavedSearch::create([
            'user_id' => $user->id,
            'name' => 'Abordable',
            'criteria' => ['price_max' => 200_000],
            'notification_frequency' => 'daily',
            'is_active' => true,
            'last_notified_at' => now()->subDay(),
        ]);
        $this->indexProperties();

        return $recherche;
    }

    private function passageDesRecherches(): void
    {
        (new SendSavedSearchAlerts)->handle(app(SearchService::class));
    }

    /** La cloche lève après l'e-mail : trois passages, UN e-mail — l'alerte perd la cloche. */
    public function test_recherche_la_cloche_qui_leve_apres_l_e_mail_ne_le_fait_pas_repartir(): void
    {
        $user = User::factory()->create();
        $recherche = $this->rechercheAvecUnBien($user);
        $avant = $recherche->last_notified_at;
        $this->enPanne = ['database'];

        foreach (range(1, 3) as $i) {
            $this->passageDesRecherches();
        }

        $this->assertSame(1, $this->partis['mail'], 'un e-mail parti ne repart pas');
        $this->assertSame(0, AppNotification::where('user_id', $user->id)->count(), 'la cloche est perdue, pas rejouée');
        $this->assertTrue($recherche->refresh()->last_notified_at->isAfter($avant), 'la réservation est gardée');
    }

    /** L'e-mail lève avant tout envoi : la réservation est rendue, et le passage suivant envoie. */
    public function test_recherche_un_e_mail_qui_leve_avant_tout_envoi_rend_la_reservation(): void
    {
        $user = User::factory()->create();
        $recherche = $this->rechercheAvecUnBien($user);
        $avant = $recherche->getRawOriginal('last_notified_at');
        $this->enPanne = ['mail'];

        $this->passageDesRecherches();
        $this->assertSame($avant, $recherche->refresh()->getRawOriginal('last_notified_at'), 'réservation rendue');
        $this->assertSame(0, $this->partis['mail'] + $this->partis['database']);

        $this->enPanne = [];
        $this->passageDesRecherches();
        $this->assertSame(1, $this->partis['mail']);
        $this->assertSame(1, AppNotification::where('user_id', $user->id)->count());
    }

    /** Même règle pour les favoris : la cloche qui lève après l'e-mail d'une baisse ne le fait pas repartir. */
    public function test_favori_la_cloche_qui_leve_apres_l_e_mail_ne_le_fait_pas_repartir(): void
    {
        $user = User::factory()->create();
        $bien = Property::factory()->published()->create(['price' => 500_000, 'currency' => Currency::XOF]);
        Favorite::create(['user_id' => $user->id, 'property_id' => $bien->id]);
        (new SendFavoriteChangeAlerts)->handle(); // pose la base
        $bien->update(['price' => 450_000]);
        $this->partis = ['mail' => 0, 'database' => 0];
        $this->enPanne = ['database'];

        foreach (range(1, 3) as $i) {
            (new SendFavoriteChangeAlerts)->handle();
        }

        $this->assertSame(1, $this->partis['mail'], 'un e-mail de baisse parti ne repart pas');
        $this->assertSame('450000.00', Favorite::sole()->getRawOriginal('alert_baseline_price'), 'la base reste rebasée');
    }

    /** Favoris, e-mail qui lève avant tout envoi : la base est rendue, le passage suivant annonce. */
    public function test_favori_un_e_mail_qui_leve_rend_la_base(): void
    {
        $user = User::factory()->create();
        $bien = Property::factory()->published()->create(['price' => 500_000, 'currency' => Currency::XOF]);
        Favorite::create(['user_id' => $user->id, 'property_id' => $bien->id]);
        (new SendFavoriteChangeAlerts)->handle();
        $bien->update(['price' => 450_000]);
        $this->partis = ['mail' => 0, 'database' => 0];
        $this->enPanne = ['mail'];

        (new SendFavoriteChangeAlerts)->handle();
        $this->assertSame('500000.00', Favorite::sole()->getRawOriginal('alert_baseline_price'));

        $this->enPanne = [];
        (new SendFavoriteChangeAlerts)->handle();
        $this->assertSame(1, $this->partis['mail']);
        $this->assertSame(1, $this->partis['database']);
    }
}
