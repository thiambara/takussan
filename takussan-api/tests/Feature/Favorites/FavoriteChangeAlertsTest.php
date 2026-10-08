<?php

namespace Tests\Feature\Favorites;

use App\Jobs\SendFavoriteChangeAlerts;
use App\Models\AppNotification;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Favorite;
use App\Models\NotificationPreference;
use App\Models\Property;
use App\Models\User;
use App\Services\Formatting\CurrencyFormatter;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
