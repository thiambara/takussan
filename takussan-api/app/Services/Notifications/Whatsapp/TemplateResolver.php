<?php

namespace App\Services\Notifications\Whatsapp;

use App\Models\NotificationTemplate;
use App\Services\Notifications\PreferenceResolver;

/**
 * TCK-283 — Resolve an approved Meta template for an `event + locale` from
 * the notification template registry (`notification_templates` rows where
 * `channel = 'whatsapp'`). Returns null when no `meta_status = approved`
 * row exists — the channel then falls back to SMS.
 */
class TemplateResolver
{
    /** @var array<string, list<string>> */
    public const FALLBACKS = ['wo' => ['fr']];

    /**
     * Build a template ref for the event/locale using the registry's
     * approved Meta template name. `$params` carries the ordered body
     * variable values supplied by the notification.
     *
     * TCK-588 (ADR-0032 §3) — un destinataire wolof hors fenêtre de 24 h basculait toujours en
     * SMS, même avec un gabarit `fr` approuvé : la présence du wolof parmi les langues de
     * gabarit Meta n'est pas acquise. On cherche donc la langue exacte, puis {@see FALLBACKS}.
     * Le texte libre (dans la fenêtre) et le SMS restent dans la langue du destinataire.
     *
     * @param  list<string>  $params
     */
    public function resolve(string $event, string $locale, array $params = []): ?WhatsappTemplateRef
    {
        foreach ([$locale, ...(self::FALLBACKS[$locale] ?? [])] as $candidate) {
            $row = NotificationTemplate::query()
                ->where('channel', PreferenceResolver::CHANNEL_WHATSAPP)
                ->where('event', $event)
                ->where('locale', $candidate)
                ->where('meta_status', NotificationTemplate::META_STATUS_APPROVED)
                ->whereNotNull('meta_template_name')
                ->first();

            if ($row) {
                return new WhatsappTemplateRef(
                    name: (string) $row->meta_template_name,
                    language: $candidate,
                    params: array_values($params),
                );
            }
        }

        return null;
    }
}
