<?php

namespace Tests\Unit\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Notifications\CodedNotification;
use App\Notifications\Concerns\SupportsSms;
use App\Notifications\Concerns\SupportsWhatsapp;
use App\Notifications\LeaseSignatureCodeNotification;
use App\Services\Notifications\PreferenceResolver;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;

/**
 * TCK-588 — une classe `Notification` qui sait partir par SMS ou WhatsApp n'a ces cases dans la
 * matrice de préférences que si son `EVENT_TYPE` figure dans
 * `PreferenceResolver::MOBILE_CLASS_EVENTS` : sinon la case est verrouillée et le message ne part
 * jamais sur mobile. Et réciproquement, un événement listé sans classe ouvrirait une case qui ne
 * commande rien.
 *
 * `CodedNotification` est hors liste : ses événements viennent de `NotificationCode::mobile()`.
 */
class MobileClassEventsTest extends TestCase
{
    /**
     * TCK-596 §4B — les classes HORS PRÉFÉRENCES : un code à usage unique demandé par son
     * destinataire, toujours critique (`isCriticalSms()` vrai), que `SmsChannel` envoie sans lire la
     * matrice. Lui ouvrir une case ouvrirait une case qui ne commande rien — l'inverse exact de ce
     * que ce test garde. La liste est fermée : y entrer se justifie dans le docblock de la classe.
     *
     * @var list<class-string>
     */
    private const HORS_PREFERENCES = [
        LeaseSignatureCodeNotification::class,
    ];

    /** @return array<class-string, string> classe → EVENT_TYPE */
    private function mobileClasses(): array
    {
        $root = dirname(__DIR__, 3).'/app/Notifications';
        $found = [];
        foreach (glob($root.'/*.php') ?: [] as $file) {
            $class = 'App\\Notifications\\'.basename($file, '.php');
            if (! class_exists($class) || $class === CodedNotification::class || in_array($class, self::HORS_PREFERENCES, true)) {
                continue;
            }
            $reflection = new ReflectionClass($class);
            if ($reflection->isAbstract()) {
                continue;
            }
            if ($reflection->implementsInterface(SupportsSms::class) || $reflection->implementsInterface(SupportsWhatsapp::class)) {
                $this->assertTrue($reflection->hasConstant('EVENT_TYPE'), "{$class} n'a pas d'EVENT_TYPE");
                $found[$class] = (string) $reflection->getConstant('EVENT_TYPE');
            }
        }

        return $found;
    }

    public function test_chaque_classe_mobile_a_son_evenement_et_reciproquement(): void
    {
        $classes = $this->mobileClasses();

        $this->assertNotEmpty($classes, 'aucune classe SupportsSms/SupportsWhatsapp lue : le test ne garde rien');
        foreach ($classes as $class => $event) {
            $this->assertContains($event, PreferenceResolver::MOBILE_CLASS_EVENTS, "{$class} ({$event}) absente de MOBILE_CLASS_EVENTS");
        }
        foreach (PreferenceResolver::MOBILE_CLASS_EVENTS as $event) {
            $this->assertContains($event, $classes, "{$event} listé sans classe mobile");
        }
    }

    /**
     * TCK-1053 (P75.01) — chaque événement dont la matrice ouvre les cases `sms`/`whatsapp` a un
     * émetteur réel : un code `mobile()` de cet événement nommé hors du catalogue des codes, ou une
     * classe mobile de cet événement envoyée par `notify(new …)` / `send(…, new …)`.
     *
     * `NewBookingNotification` n'était nommée que par `AppDatabaseChannel` et `PreferenceResolver` :
     * le premier test passait, et les cases `booking_request` étaient cochables sans rien commander.
     */
    public function test_chaque_evenement_mobile_a_un_emetteur_reel(): void
    {
        $app = dirname(__DIR__, 3).'/app';
        $sources = [];
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($app, RecursiveDirectoryIterator::SKIP_DOTS)) as $file) {
            if ($file->getExtension() === 'php' && ! str_starts_with($file->getPathname(), $app.'/Domain/Notifications/')) {
                $sources[$file->getPathname()] = (string) file_get_contents($file->getPathname());
            }
        }
        $code = implode("\n", $sources);

        $classes = $this->mobileClasses();
        $events = PreferenceResolver::mobileEvents();
        $this->assertNotEmpty($events);

        foreach ($events as $event) {
            $emis = false;
            foreach (NotificationCode::cases() as $case) {
                if ($case->mobile() && $case->preferenceEvent() === $event
                    && preg_match('/NotificationCode::'.$case->name.'\b/', $code) === 1) {
                    $emis = true;
                }
            }
            foreach (array_keys($classes, $event, true) as $class) {
                $court = (new ReflectionClass($class))->getShortName();
                if (preg_match('/(notify|notifyNow|send|sendNow)\(\s*(\$[^,()]+,\s*)?new\s+'.$court.'\b/', $code) === 1) {
                    $emis = true;
                }
            }
            $this->assertTrue($emis, "l'événement mobile {$event} n'a aucun émetteur : ses cases sms/whatsapp ne commandent rien");
        }
    }

    /** Une exemption ne tient que si la classe contourne vraiment la matrice : critique, toujours. */
    public function test_les_classes_hors_preferences_sont_critiques(): void
    {
        $this->assertTrue((new LeaseSignatureCodeNotification('000000', 'LS-1', 10, LeaseSignatureCodeNotification::CHANNEL_SMS))->isCriticalSms());
        $this->assertSame([LeaseSignatureCodeNotification::class], self::HORS_PREFERENCES);
    }
}
