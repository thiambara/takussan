<?php

namespace Tests\Feature\Favorites;

use App\Jobs\SendFavoriteChangeAlerts;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Favorite;
use App\Models\NotificationPreference;
use App\Models\Property;
use App\Models\User;
use App\Notifications\FavoriteChangesNotification;
use App\Services\Formatting\CurrencyFormatter;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Notifications\Events\NotificationSending;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

/**
 * TCK-599 §5 — **AC20** (C17) et **AC21** : un favori prévient d'une baisse de prix et d'une
 * sortie du public, une fois, groupé par personne, et une sortie du public ne porte jamais de prix.
 */
class FavoriteChangeAlertsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function favori(User $client, int $prix = 500_000): Property
    {
        $bien = Property::factory()->published()->create(['price' => $prix, 'currency' => Currency::XOF, 'title' => 'Villa Ngor']);
        Favorite::create(['user_id' => $client->id, 'property_id' => $bien->id]);

        return $bien;
    }

    private function lancerLeJob(): void
    {
        (new SendFavoriteChangeAlerts)->handle();
    }

    /** @return Collection<int, AppNotification> */
    private function notificationsDe(User $user): Collection
    {
        return AppNotification::where('user_id', $user->id)->orderBy('id')->get();
    }

    /** @return list<Email> */
    private function emailsA(User $user): array
    {
        return collect(app('mailer')->getSymfonyTransport()->messages())
            ->map(fn (SentMessage $m) => $m->getOriginalMessage())
            ->filter(fn (Email $e) => collect($e->getTo())->contains(fn ($a) => $a->getAddress() === $user->email))
            ->values()
            ->all();
    }

    private function prix(int $montant): string
    {
        return app(CurrencyFormatter::class)->format($montant, Currency::XOF, 'fr');
    }

    public function test_la_base_est_le_prix_a_la_mise_en_favori(): void
    {
        $client = User::factory()->create();
        $bien = Property::factory()->published()->create(['price' => 480_000]);

        Sanctum::actingAs($client);
        $this->postJson('/api/favorites', ['property_id' => $bien->id])->assertCreated()->assertJsonMissingPath('data.alert_baseline_price');

        $this->assertSame('480000.00', Favorite::sole()->getRawOriginal('alert_baseline_price'));
    }

    /** **AC20** — une baisse : UNE notification le lendemain, la suivante n'envoie rien. */
    public function test_une_baisse_est_annoncee_une_fois(): void
    {
        $client = User::factory()->create(['preferred_language' => 'fr']);
        $bien = $this->favori($client);
        $bien->update(['price' => 450_000]);

        $this->lancerLeJob();
        $this->lancerLeJob();

        $ligne = $this->notificationsDe($client)->sole();
        $this->assertEquals(['property_ids' => [$bien->id], 'kind' => 'price_drop'], $ligne->data);
        $mail = (string) $this->emailsA($client)[0]->getHtmlBody();
        $this->assertStringContainsString(e($this->prix(500_000)), $mail);
        $this->assertStringContainsString(e($this->prix(450_000)), $mail);
    }

    /** **AC20** — 500 000 → 450 000 → 520 000 dans la journée : aucune notification, la base monte. */
    public function test_une_baisse_effacee_par_une_hausse_ne_dit_rien(): void
    {
        $client = User::factory()->create();
        $bien = $this->favori($client);
        $bien->update(['price' => 450_000]);
        $bien->update(['price' => 520_000]);

        $this->lancerLeJob();

        $this->assertCount(0, $this->notificationsDe($client));
        $this->assertSame('520000.00', Favorite::sole()->getRawOriginal('alert_baseline_price'));
    }

    /** **AC20** — loué : une notification « loué », sans prix ; une seule fois. */
    public function test_un_bien_loue_est_annonce_une_fois_sans_prix(): void
    {
        $client = User::factory()->create(['preferred_language' => 'fr']);
        $bien = $this->favori($client);
        $bien->update(['status' => PropertyStatus::Rented]);

        $this->lancerLeJob();
        $this->lancerLeJob();

        $ligne = $this->notificationsDe($client)->sole();
        $this->assertSame('unavailable', $ligne->data['kind']);
        $mail = (string) $this->emailsA($client)[0]->getHtmlBody();
        $this->assertStringContainsString(e(__('favorite_alerts.unavailable.line_rented', ['title' => 'Villa Ngor'], 'fr')), $mail);
        $this->assertStringNotContainsString(e($this->prix(500_000)), $mail, 'aucun prix');
    }

    /** **AC20** — `favorite_price_drop` coupé : pas d'e-mail pour la baisse, l'indisponibilité part. */
    public function test_couper_la_baisse_ne_coupe_pas_l_indisponibilite(): void
    {
        $client = User::factory()->create(['preferred_language' => 'fr']);
        NotificationPreference::updateOrCreate(['user_id' => $client->id, 'event_type' => 'favorite_price_drop', 'channel' => 'email'], ['enabled' => false]);
        $baisse = $this->favori($client);
        $loue = $this->favori($client);
        $baisse->update(['price' => 450_000]);
        $loue->update(['status' => PropertyStatus::Rented]);

        $this->lancerLeJob();

        $mails = $this->emailsA($client);
        $this->assertCount(1, $mails, 'seule l\'indisponibilité part par e-mail');
        $this->assertSame(__('favorite_alerts.unavailable.title', [], 'fr'), $mails[0]->getSubject());
    }

    /** **AC21** — devenu privé le jour d'une baisse : seule l'indisponibilité, jamais le nouveau prix. */
    public function test_un_bien_prive_le_jour_d_une_baisse_ne_dit_que_son_indisponibilite(): void
    {
        $client = User::factory()->create();
        $bien = $this->favori($client);
        $bien->update(['price' => 450_000, 'visibility' => PropertyVisibility::Private]);

        $this->lancerLeJob();

        $ligne = $this->notificationsDe($client)->sole();
        $this->assertSame('unavailable', $ligne->data['kind']);
        $mail = (string) $this->emailsA($client)[0]->getHtmlBody();
        $this->assertStringNotContainsString(e($this->prix(450_000)), $mail.$ligne->body, 'le nouveau prix ne sort pas');
        $this->assertSame([], Favorite::where('user_id', $client->id)->whereNull('unavailable_notified_at')->pluck('id')->all());
    }

    /** Un retour au public remet l'annonce à zéro, sans rien dire. */
    public function test_un_retour_au_public_ne_dit_rien_et_rearme_l_annonce(): void
    {
        $client = User::factory()->create();
        $bien = $this->favori($client);
        $bien->update(['status' => PropertyStatus::Rented]);
        $this->lancerLeJob();
        $bien->update(['status' => PropertyStatus::Available, 'price' => 400_000]);

        $this->lancerLeJob();

        $this->assertCount(1, $this->notificationsDe($client));
        $this->assertNull(Favorite::sole()->unavailable_notified_at);
        $this->assertSame('400000.00', Favorite::sole()->getRawOriginal('alert_baseline_price'));
    }

    /**
     * TCK-600 (ADR-0048) — le bien d'une agence suspendue est MASQUÉ, pas sorti : le job n'en dit
     * rien et ne touche pas sa base. À la levée, une baisse prise contre la base d'avant s'annonce.
     */
    public function test_une_agence_suspendue_gele_le_favori_sans_l_annoncer(): void
    {
        $client = User::factory()->create();
        $agence = Agency::factory()->create();
        $bien = $this->favori($client);
        $bien->forceFill(['agency_id' => $agence->id])->save();
        $agence->forceFill(['status' => AgencyStatus::Suspended])->save();
        $bien->update(['price' => 450_000]);

        $this->lancerLeJob();

        $this->assertCount(0, $this->notificationsDe($client));
        $this->assertNull(Favorite::sole()->unavailable_notified_at);
        $this->assertSame('500000.00', Favorite::sole()->getRawOriginal('alert_baseline_price'));

        $agence->forceFill(['status' => AgencyStatus::Active])->save();
        $this->lancerLeJob();

        $this->assertSame([$bien->id], $this->notificationsDe($client)->sole()->data['property_ids']);
        $this->assertSame('450000.00', Favorite::sole()->getRawOriginal('alert_baseline_price'));
    }

    /**
     * verif-599 M1 — un second passage qui a lu le même état que le premier n'annonce rien
     * de plus : l'annonce est réservée avant l'envoi, sur l'état lu. Le recouvrement est rejoué de
     * façon déterministe.
     */
    public function test_deux_passages_qui_se_recouvrent_n_annoncent_qu_une_fois(): void
    {
        $clients = User::factory()->count(3)->create();
        foreach ($clients as $client) {
            $this->favori($client)->update(['price' => 450_000]);
            $this->favori($client)->update(['status' => PropertyStatus::Rented]);
        }
        // Le second passage tourne en entier APRÈS que le premier a lu l'état et AVANT qu'il ne
        // le réserve : le premier repart avec un état périmé, que sa réservation doit refuser.
        $imbrique = false;
        Favorite::retrieved(function () use (&$imbrique): void {
            if (! $imbrique) {
                $imbrique = true;
                $this->lancerLeJob();
            }
        });

        $this->lancerLeJob();

        $this->assertTrue($imbrique);
        foreach ($clients as $client) {
            $this->assertCount(2, $this->notificationsDe($client), 'une baisse et une sortie, chacune une fois');
        }
    }

    /** Un envoi qui échoue rend sa réservation : le passage suivant annonce. */
    public function test_un_envoi_qui_echoue_rend_sa_reservation(): void
    {
        $client = User::factory()->create();
        $this->favori($client)->update(['price' => 450_000]);
        $echec = true;
        Event::listen(NotificationSending::class, function () use (&$echec): void {
            if ($echec) {
                throw new \RuntimeException('transport indisponible');
            }
        });

        $this->lancerLeJob();
        $this->assertCount(0, $this->notificationsDe($client));
        $this->assertSame('500000.00', Favorite::sole()->getRawOriginal('alert_baseline_price'));

        $echec = false;
        $this->lancerLeJob();
        $this->assertCount(1, $this->notificationsDe($client));
    }

    /**
     * verif-599 m10 — l'échec d'UNE annonce ne rend que SES réservations. La baisse est partie,
     * l'indisponibilité échoue : au passage suivant, seule l'indisponibilité repart.
     */
    public function test_l_echec_d_une_annonce_ne_rejoue_pas_l_autre(): void
    {
        $client = User::factory()->create();
        $this->favori($client)->update(['price' => 450_000]);
        $this->favori($client)->update(['status' => PropertyStatus::Rented]);
        $echec = true;
        Event::listen(NotificationSending::class, function (NotificationSending $e) use (&$echec): void {
            if ($echec && $e->channel === 'mail' && $e->notification->kind === FavoriteChangesNotification::KIND_UNAVAILABLE) {
                throw new \RuntimeException('transport indisponible');
            }
        });
        $mails = [];
        Event::listen(NotificationSent::class, function (NotificationSent $e) use (&$mails): void {
            if ($e->channel === 'mail') {
                $mails[] = $e->notification->kind;
            }
        });

        $journal = [];
        Event::listen(MessageLogged::class, function (MessageLogged $e) use (&$journal): void {
            $journal[] = $e->message;
        });

        $this->lancerLeJob();
        $this->assertSame([FavoriteChangesNotification::KIND_PRICE_DROP], $mails);
        $this->assertSame(['favorite_alert.failed'], $journal, 'l\'échec reste journalisé');

        $echec = false;
        $this->lancerLeJob();
        $this->assertSame([FavoriteChangesNotification::KIND_PRICE_DROP, FavoriteChangesNotification::KIND_UNAVAILABLE], $mails, 'la baisse ne repart pas');
    }

    /**
     * verif-599 m11 — l'e-mail en échec ne laisse pas de cloche : la cloche part en dernier, la
     * reprise l'écrit une seule fois.
     */
    public function test_un_e_mail_en_echec_ne_double_pas_la_cloche(): void
    {
        $client = User::factory()->create();
        $this->favori($client)->update(['price' => 450_000]);
        $echec = true;
        Event::listen(NotificationSending::class, function (NotificationSending $e) use (&$echec): void {
            if ($echec && $e->channel === 'mail') {
                throw new \RuntimeException('transport indisponible');
            }
        });

        $this->lancerLeJob();
        $this->assertCount(0, $this->notificationsDe($client), 'aucune cloche sans e-mail');

        $echec = false;
        $this->lancerLeJob();
        $this->assertCount(1, $this->notificationsDe($client));
        $this->assertCount(1, $this->emailsA($client));
    }

    /** Le verrou de job : un passage mis en file pendant qu'un autre tient le verrou est abandonné. */
    public function test_un_passage_pendant_un_autre_est_abandonne(): void
    {
        $client = User::factory()->create();
        $this->favori($client)->update(['price' => 450_000]);
        $verrou = Cache::lock('laravel-queue-overlap:'.SendFavoriteChangeAlerts::class.':favorite-change-alerts', 600);
        $this->assertTrue($verrou->get());

        SendFavoriteChangeAlerts::dispatch();
        $this->assertCount(0, $this->notificationsDe($client));

        $verrou->release();
        SendFavoriteChangeAlerts::dispatch();
        $this->assertCount(1, $this->notificationsDe($client));
    }

    /** Groupée : deux baisses, une notification. */
    public function test_les_baisses_d_une_personne_sont_groupees(): void
    {
        $client = User::factory()->create();
        $a = $this->favori($client);
        $b = $this->favori($client);
        $a->update(['price' => 400_000]);
        $b->update(['price' => 300_000]);

        $this->lancerLeJob();

        $this->assertEqualsCanonicalizing([$a->id, $b->id], $this->notificationsDe($client)->sole()->data['property_ids']);
    }
}
