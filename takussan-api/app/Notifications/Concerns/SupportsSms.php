<?php

namespace App\Notifications\Concerns;

use App\Notifications\Channels\SmsChannel;

/**
 * TCK-102 — Marker interface a Notification implements when it can be
 * delivered through SMS. The {@see SmsChannel}
 * channel ignores any Notification that doesn't expose this contract.
 *
 * `toSms()` returns the body to send. `shouldSendSms()` returns true if
 * the notification is currently eligible (e.g. opt-in honored).
 * `isCriticalSms()` is consulted by the router to bypass quiet hours.
 *
 * TCK-2464 — `smsEventType(): string`, l'événement de préférence, n'est PAS dans le contrat, mais
 * le canal le relit : sans lui, une notification NON critique adressée à un `User` est refusée
 * (et le refus journalisé). Une critique n'en a pas besoin — `LeaseSignatureCodeNotification`
 * n'en déclare pas, et son `event_type` de livraison reste nul. Pourquoi pas dans l'interface :
 * l'y mettre obligerait ce code de signature à se donner un événement qu'aucune préférence ne lit.
 * L'exception des destinataires non-`User` est écrite dans `SmsChannel::isOptedIn()`.
 */
interface SupportsSms
{
    public function toSms(object $notifiable): string;

    public function shouldSendSms(): bool;

    public function isCriticalSms(): bool;
}
