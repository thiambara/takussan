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
    /**
     * Build a template ref for the event/locale using the registry's
     * approved Meta template name. `$params` carries the ordered body
     * variable values supplied by the notification.
     *
     * @param  list<string>  $params
     */
    public function resolve(string $event, string $locale, array $params = []): ?WhatsappTemplateRef
    {
        $row = NotificationTemplate::query()
            ->where('channel', PreferenceResolver::CHANNEL_WHATSAPP)
            ->where('event', $event)
            ->where('locale', $locale)
            ->where('meta_status', NotificationTemplate::META_STATUS_APPROVED)
            ->whereNotNull('meta_template_name')
            ->first();

        if (! $row) {
            return null;
        }

        return new WhatsappTemplateRef(
            name: (string) $row->meta_template_name,
            language: $locale,
            params: array_values($params),
        );
    }
}
