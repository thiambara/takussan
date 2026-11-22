<?php

namespace App\Services\Visit;

/**
 * TCK-2871 — ce qui a été REMIS aux canaux pour le visiteur d'une visite, tel que l'agent qui la
 * crée le lit (« SMS envoyé à 09:21 » et son texte) : les canaux, et le SMS lui-même.
 *
 * Rempli par {@see VisitNotifier} au moment de la remise (patron de `SmsOutcome` : l'appelant passe
 * l'objet, l'émetteur l'écrit), jamais reconstruit après coup :
 *   · `channels` — les canaux que la notification prend pour ce destinataire, dans le vocabulaire de
 *     `NotificationChannel` (`app`, `email`, `push`, `sms`, `whatsapp`) ;
 *   · `sms` — le texte du SMS **rendu au moment de la remise**, avec la notification, la langue et le
 *     fuseau du destinataire que le canal SMS emploiera (`CodedNotification::toSms`), et l'heure de
 *     cette remise. `null` quand aucun SMS n'est remis : pas de mobile, SMS retenu par la borne
 *     (`visit_sms_capped`), ou canal WhatsApp ÉLIGIBLE (gabarit approuvé, fenêtre ouverte). Un canal
 *     WhatsApp inéligible à l'instant de la remise se replie sur le SMS
 *     (`WhatsappChannel::seReplieraitSurSms`) : il est rendu comme le SMS qu'il est, sous `sms`.
 *
 * ⚠ « remis » n'est pas « parti » (P179.04) : l'envoi part en file ; son échec se lit au worker.
 */
final class RemiseAuVisiteur
{
    /** @var list<string> */
    public array $channels = [];

    /** @var array{queued_at: string, body: string}|null */
    public ?array $sms = null;

    /** @param  list<string>  $channels */
    public function ajouterCanaux(array $channels): void
    {
        $this->channels = array_values(array_unique([...$this->channels, ...$channels]));
    }

    /** @return array{channels: list<string>, sms: array{queued_at: string, body: string}|null} */
    public function toArray(): array
    {
        return ['channels' => $this->channels, 'sms' => $this->sms];
    }
}
