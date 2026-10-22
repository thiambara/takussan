<?php

namespace Tests\Feature\Notifications;

use App\Models\Booking;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Notifications\BookingExpiredNotification;
use App\Notifications\LeaseDepositRefundNotification;
use App\Notifications\PropertyApprovedNotification;
use App\Notifications\PropertyRejectedNotification;
use App\Notifications\TenantWelcomeNotification;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionClass;
use Tests\TestCase;

/**
 * TCK-1193 (P75.02) — un événement qu'une classe passe à `PreferenceResolver::shouldSend()` doit
 * avoir son interrupteur dans `PreferenceResolver::EVENTS` (ou être critique) : sinon `updateMany()`
 * l'ignore, l'écran n'a pas de case, et l'appel ne commande rien. Cinq événements des classes
 * historiques étaient dans ce cas ; leur e-mail partait quoi que l'utilisateur ait coupé.
 */
class HistoricalClassPreferenceEventsTest extends TestCase
{
    use RefreshDatabase;

    /** @return list<string> */
    private function evenementsPermis(): array
    {
        return [...PreferenceResolver::EVENTS, ...PreferenceResolver::CRITICAL_EVENTS];
    }

    public function test_chaque_evenement_passe_au_resolveur_a_un_interrupteur(): void
    {
        $fichiers = glob(dirname(__DIR__, 3).'/app/Notifications/*.php') ?: [];
        $this->assertNotEmpty($fichiers, 'aucune classe de app/Notifications lue : le test ne garde rien');

        $lus = 0;
        foreach ($fichiers as $fichier) {
            $classe = 'App\\Notifications\\'.basename($fichier, '.php');
            if (class_exists($classe)) {
                foreach ((new ReflectionClass($classe))->getReflectionConstants() as $constante) {
                    if ($constante->getDeclaringClass()->getName() !== $classe || ! str_starts_with($constante->getName(), 'EVENT_TYPE')) {
                        continue;
                    }
                    $lus++;
                    $this->assertContains(
                        $constante->getValue(),
                        $this->evenementsPermis(),
                        "{$classe}::{$constante->getName()} ({$constante->getValue()}) n'a pas d'interrupteur dans PreferenceResolver::EVENTS",
                    );
                }
            }

            preg_match_all("/shouldSend\\(\\s*\\\$\\w+\\s*,\\s*'([^']+)'/", (string) file_get_contents($fichier), $litteraux);
            foreach ($litteraux[1] as $evenement) {
                $lus++;
                $this->assertContains($evenement, $this->evenementsPermis(), "{$classe} passe « {$evenement} » à shouldSend() sans interrupteur");
            }
        }

        $this->assertGreaterThan(5, $lus, 'trop peu d\'événements lus : le motif de lecture ne voit plus les classes');
    }

    public function test_l_expiration_suit_l_interrupteur_du_statut_de_reservation_chez_le_client(): void
    {
        $user = User::factory()->create();
        $notification = new BookingExpiredNotification(new Booking, 'tenant');

        $this->assertContains('mail', $notification->via($user), 'sans préférence, l\'expiration part par e-mail');

        app(PreferenceResolver::class)->updateMany($user, [
            ['event_type' => 'booking_status_changed', 'channel' => PreferenceResolver::CHANNEL_EMAIL, 'enabled' => false],
        ]);

        $this->assertNotContains('mail', $notification->via($user));
        $this->assertContains('database', $notification->via($user));
    }

    public function test_l_expiration_de_l_agent_reste_dans_la_cloche_seule(): void
    {
        $user = User::factory()->create();

        $this->assertSame(['database'], (new BookingExpiredNotification(new Booking, 'agent'))->via($user));
    }

    /** @return array<string, array{string}> */
    public static function envoisNonDesactivables(): array
    {
        return [
            'bienvenue du locataire' => [TenantWelcomeNotification::class],
            'restitution du dépôt' => [LeaseDepositRefundNotification::class],
            'bien approuvé' => [PropertyApprovedNotification::class],
            'bien refusé' => [PropertyRejectedNotification::class],
        ];
    }

    private function construire(string $classe): Notification
    {
        return match ($classe) {
            TenantWelcomeNotification::class => new TenantWelcomeNotification(new Lease),
            LeaseDepositRefundNotification::class => new LeaseDepositRefundNotification(new Lease, 0.0, 0.0, ''),
            PropertyApprovedNotification::class => new PropertyApprovedNotification(new Property),
            PropertyRejectedNotification::class => new PropertyRejectedNotification(new Property, 'motif'),
        };
    }

    #[DataProvider('envoisNonDesactivables')]
    public function test_un_envoi_sans_interrupteur_ne_lit_pas_le_resolveur(string $classe): void
    {
        $notification = $this->construire($classe);

        $this->app->instance(PreferenceResolver::class, new class extends PreferenceResolver
        {
            public function shouldSend(User $user, string $eventType, string $channel): bool
            {
                return false;
            }
        });

        $canaux = $notification->via(User::factory()->create());

        $this->assertContains('database', $canaux);
        $this->assertContains('mail', $canaux);
    }
}
