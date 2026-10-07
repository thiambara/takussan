<?php

namespace Tests\Unit\Notifications;

use App\Notifications\CodedNotification;
use App\Notifications\Concerns\SupportsSms;
use App\Notifications\Concerns\SupportsWhatsapp;
use App\Services\Notifications\PreferenceResolver;
use PHPUnit\Framework\TestCase;
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
    /** @return array<class-string, string> classe → EVENT_TYPE */
    private function mobileClasses(): array
    {
        $root = dirname(__DIR__, 3).'/app/Notifications';
        $found = [];
        foreach (glob($root.'/*.php') ?: [] as $file) {
            $class = 'App\\Notifications\\'.basename($file, '.php');
            if (! class_exists($class) || $class === CodedNotification::class) {
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
}
