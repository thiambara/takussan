<?php

namespace Tests\Unit\Architecture;

use App\Jobs\SendFavoriteChangeAlerts;
use App\Jobs\SendSavedSearchAlerts;
use App\Notifications\FavoriteChangesNotification;
use App\Notifications\LeaseSignatureCodeNotification;
use App\Notifications\SavedSearchMatchesNotification;
use App\Services\Lease\LeaseSignatureService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use PHPUnit\Framework\TestCase;

/**
 * P179.03 (TCK-1797) — les notifications dont l'APPELANT juge l'envoi restent synchrones.
 *
 * Leur appelant entoure `notify()` d'un `try` et rend quelque chose sur un échec : la réservation
 * d'une fenêtre ({@see SendSavedSearchAlerts}, {@see SendFavoriteChangeAlerts}), la fenêtre de
 * renvoi d'un code ({@see LeaseSignatureService::sendCode()}, qui lit aussi `smsLeft()`). Mise en
 * file, la notification ne lèverait plus qu'au worker : le `catch` deviendrait inerte, et la
 * reprise serait perdue sans un mot.
 *
 * Les tests de ces replis ne le voient pas : `phpunit.xml` pose `QUEUE_CONNECTION=sync`, où une
 * notification `ShouldQueue` part dans l'appel et lève au même endroit (mesuré : `ShouldQueue`
 * ajouté à `SavedSearchMatchesNotification`, les deux tests de repli de `SavedSearchAlertsTest`
 * restent verts). D'où cette garde, qui ne dépend pas de la connexion de file.
 *
 * Mettre l'une d'elles en file est possible, mais c'est un autre contrat : l'appelant doit alors
 * relire le sort de l'envoi ailleurs, et la classe sort de cette liste avec lui.
 */
class NotificationsJugeesALEnvoiTest extends TestCase
{
    /** @var array<class-string, string> la notification => ce que son appelant rend sur un échec */
    private const SYNCHRONES = [
        SavedSearchMatchesNotification::class => 'SendSavedSearchAlerts rend la réservation de la fenêtre',
        FavoriteChangesNotification::class => 'SendFavoriteChangeAlerts rend les réservations du lot',
        LeaseSignatureCodeNotification::class => 'LeaseSignatureService::sendCode() rend la fenêtre de renvoi et lit smsLeft()',
    ];

    public function test_les_notifications_dont_l_appelant_juge_l_envoi_ne_sont_pas_en_file(): void
    {
        foreach (self::SYNCHRONES as $classe => $motif) {
            $this->assertTrue(class_exists($classe), "{$classe} introuvable : la garde ne garde plus rien");
            $this->assertTrue(is_subclass_of($classe, Notification::class), "{$classe} n'est pas une notification");
            $this->assertFalse(
                is_subclass_of($classe, ShouldQueue::class),
                "{$classe} doit rester synchrone : {$motif} quand notify() lève, ce qu'un envoi en file ne fait plus.",
            );
        }
    }
}
