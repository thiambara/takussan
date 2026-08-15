<?php

namespace App\Notifications\Concerns;

use App\Notifications\Channels\WhatsappChannel;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;

/**
 * TCK-282 — Marker interface a Notification implements when it can be
 * delivered through WhatsApp. The {@see WhatsappChannel}
 * ignores any Notification that doesn't expose this contract. Mirror of
 * {@see SupportsSms}.
 *
 * `toWhatsapp()` returns the free-form body sent inside the service window
 * (and reused as the SMS fallback body when the notification is not also a
 * {@see SupportsSms}). `whatsappTemplate()` returns the approved Meta
 * template to use outside the window — null means "no template, fall back
 * to SMS". `isCriticalWhatsapp()` bypasses the per-event opt-in and the
 * rate limit.
 */
interface SupportsWhatsapp
{
    public function toWhatsapp(object $notifiable): string;

    public function whatsappTemplate(object $notifiable): ?WhatsappTemplateRef;

    public function shouldSendWhatsapp(): bool;

    public function isCriticalWhatsapp(): bool;
}
