<?php

namespace App\Services\Notifications\Sms;

use App\Notifications\CodedNotification;
use App\Services\Model\NotificationService;

/**
 * P179.01 (TCK-2155) — le sort du SMS d'une notification envoyée HORS FILE, que l'appelant relit
 * ({@see NotificationService::sendToContactNow()}).
 *
 * Laravel envoie une COPIE de la notification par canal : l'objet est partagé entre les copies
 * (copie superficielle), c'est donc lui, et non une propriété de la notification, qui rapporte.
 *
 *  - `$smsChosen` : {@see CodedNotification::via()} a retenu le canal SMS ;
 *  - `$results` : ce que le routeur a rendu, `null` si le canal s'est arrêté avant lui (numéro
 *    invalide, limite horaire).
 */
final class SmsOutcome
{
    public bool $smsChosen = false;

    /** @var array<string, SmsResult>|null */
    public ?array $results = null;

    /** @param  array<string, SmsResult>  $results */
    public function record(array $results): void
    {
        $this->results = $results;
    }

    /**
     * Un fournisseur a pu recevoir le message : accepté, échec ambigu (ne pas doubler un SMS
     * peut-être reçu), ou remis à la nuit par les heures calmes.
     */
    public function mayHaveReached(): bool
    {
        foreach ($this->results ?? [] as $result) {
            if (! $result instanceof SmsResult) {
                continue;
            }
            if ($result->isTerminalSuccess() || $result->status === SmsResult::STATUS_DELIVERED) {
                return true;
            }
            if ($result->status === SmsResult::STATUS_FAILED && $result->ambiguous) {
                return true;
            }
            if ($result->status === SmsResult::STATUS_DEFERRED_TO_FALLBACK && $result->failureReason === SmsResult::REASON_QUIET_HOURS) {
                return true;
            }
        }

        return false;
    }
}
