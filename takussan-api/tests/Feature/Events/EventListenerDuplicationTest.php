<?php

namespace Tests\Feature\Events;

use App\Events\Lease\LeaseActivated;
use App\Listeners\Admin\DispatchAlerts;
use App\Listeners\Lease\CreateTenantOnboardingChecklist;
use App\Listeners\Lease\SendTenantWelcomeNotification;
use Closure;
use Illuminate\Support\Facades\Event;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-443 — Garde : aucun couple (écouteur, méthode, événement) ne doit être
 * enregistré plus d'une fois sur l'application bootée.
 *
 * Pourquoi une garde et pas une relecture : le compte des doublons a été
 * sous-estimé QUATRE fois de suite par des lecteurs attentifs (7 → 12/13 → 15
 * → 21), toujours dans le sens qui rassure. Les deux causes récurrentes sont
 * de compter par ÉVÉNEMENT au lieu de compter par identité, et de croire que
 * la forme tableau `[Classe::class, 'methode']` échappe à la découverte
 * automatique — elle ne lui échappe pas, la règle du framework est le glob
 * `handle*` (`Foundation/Events/DiscoverEvents.php:87-90`).
 *
 * Le mécanisme : `Application::configure()` appelle `withEvents()` lui-même
 * (Laravel 13), donc tout `app/Listeners` est DÉJÀ auto-découvert alors que
 * `bootstrap/app.php` n'écrit `withEvents()` nulle part. Chaque
 * `Event::listen()` d'`AppServiceProvider` visant une classe de `app/Listeners`
 * en posait donc un SECOND. Les deux inscriptions apparaissent sous des chaînes
 * DIFFÉRENTES — `App\Listeners\X` et `App\Listeners\X@handle` —, et
 * `array_unique()` d'`EventServiceProvider` ne dédoublonne qu'à l'intérieur de
 * `getEvents()`, jamais entre lui et un `Event::listen()` externe. D'où la
 * normalisation ci-dessous : sans elle, la garde compterait 1 et 1 au lieu de 2.
 *
 * ⚠ Ce que cette garde NE voit PAS : deux closures identiques enregistrées deux
 * fois. Une closure n'a pas d'identité comparable ; elle est donc indexée par
 * `spl_object_id` et ne peut jamais former un doublon. C'est une limite connue,
 * pas un oubli — les doublons que ce ticket solde sont tous des classes.
 */
class EventListenerDuplicationTest extends TestCase
{
    /**
     * AC1 — 0 couple (écouteur, méthode, événement) enregistré plus d'une fois,
     * sur l'application réellement bootée (et non sur une lecture statique).
     *
     * AC2 — cette même assertion ROUGIT si l'on réintroduit un seul des
     * `Event::listen()` retirés, et le message NOMME le couple fautif.
     */
    public function test_no_listener_is_registered_twice(): void
    {
        $duplicates = $this->duplicateRegistrations();

        $this->assertSame([], $duplicates, sprintf(
            "%d couple(s) (écouteur, méthode, événement) enregistré(s) plus d'une fois :\n%s\n".
            "Cause la plus probable : un `Event::listen()` d'`AppServiceProvider` visant une classe ".
            'de `app/Listeners` que la découverte automatique inscrit déjà (TCK-443).',
            count($duplicates),
            implode("\n", array_map(
                fn (string $couple, int $n): string => "  [{$n}×] {$couple}",
                array_keys($duplicates),
                $duplicates,
            )),
        ));
    }

    /**
     * AC4 — `DispatchAlerts` reste enregistré : c'est le seul écouteur de
     * `app/Listeners` qui n'a AUCUN `Event::listen()` explicite. S'il disparaît,
     * c'est que la découverte a été coupée (`withEvents(discover: false)`), et
     * la garde AC1 serait alors verte pour la pire des raisons — plus rien à
     * compter.
     */
    public function test_discovery_is_still_on(): void
    {
        $this->assertContains(
            DispatchAlerts::class.'@handle',
            $this->registrationsFor(Activity::class),
            'DispatchAlerts n\'est plus découvert : la découverte automatique a été coupée.',
        );
    }

    /**
     * AC5 — deux écouteurs DIFFÉRENTS sur un même événement ne sont pas un
     * doublon. `SendTenantWelcomeNotification` et `CreateTenantOnboardingChecklist`
     * écoutent tous deux `LeaseActivated` légitimement : la garde compte par
     * identité, jamais par événement.
     */
    public function test_two_distinct_listeners_on_one_event_are_normal(): void
    {
        $registrations = $this->registrationsFor(LeaseActivated::class);

        $this->assertContains(SendTenantWelcomeNotification::class.'@handle', $registrations);
        $this->assertContains(CreateTenantOnboardingChecklist::class.'@handle', $registrations);
        $this->assertSame(
            $registrations,
            array_values(array_unique($registrations)),
            'LeaseActivated porte deux écouteurs distincts — et chacun une seule fois.',
        );
    }

    /**
     * Les identités `Classe@methode` inscrites sur un événement donné.
     *
     * @return list<string>
     */
    private function registrationsFor(string $event): array
    {
        return array_values(array_map(
            self::identity(...),
            Event::getRawListeners()[$event] ?? [],
        ));
    }

    /**
     * Les couples enregistrés plus d'une fois, indexés `événement ⇒ Classe@methode`.
     *
     * @return array<string, int>
     */
    private function duplicateRegistrations(): array
    {
        $counts = [];

        foreach (Event::getRawListeners() as $event => $listeners) {
            foreach ($listeners as $listener) {
                $couple = $event.' ⇒ '.self::identity($listener);
                $counts[$couple] = ($counts[$couple] ?? 0) + 1;
            }
        }

        $duplicates = array_filter($counts, static fn (int $n): bool => $n > 1);
        ksort($duplicates);

        return $duplicates;
    }

    /**
     * Normalise une inscription brute en `Classe@methode`.
     *
     * Les quatre formes que le dispatcher stocke telles quelles :
     * `Classe::class` (méthode implicite `handle`, cf. `Str::parseCallback`),
     * `'Classe@methode'`, `[Classe::class, 'methode']`, et une closure.
     */
    private static function identity(mixed $listener): string
    {
        if (is_array($listener) && count($listener) === 2) {
            $class = is_object($listener[0]) ? $listener[0]::class : (string) $listener[0];

            return $class.'@'.$listener[1];
        }

        if (is_string($listener)) {
            return str_contains($listener, '@') ? $listener : $listener.'@handle';
        }

        if (is_object($listener) && ! $listener instanceof Closure) {
            return $listener::class.'@handle';
        }

        return 'closure#'.spl_object_id($listener);
    }
}
