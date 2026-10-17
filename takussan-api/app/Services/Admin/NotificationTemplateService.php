<?php

namespace App\Services\Admin;

use App\Domain\Notifications\EditableNotificationEvents;
use App\Models\NotificationTemplate;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class NotificationTemplateService
{
    public const LOCALES = ['fr', 'en', 'wo'];

    public function all(): array
    {
        return collect(EditableNotificationEvents::all())
            ->flatMap(fn (array $definition, string $event) => collect(EditableNotificationEvents::CHANNELS)
                ->map(fn (string $channel) => $this->get($event, $channel)))
            ->values()
            ->all();
    }

    public function get(string $event, string $channel): array
    {
        $this->ensureEditable($event, $channel);
        $definition = EditableNotificationEvents::get($event);
        $rows = NotificationTemplate::query()
            ->where('event', $event)
            ->where('channel', $channel)
            ->get()
            ->keyBy('locale');

        return [
            'event' => $event,
            'channel' => $channel,
            'name' => $definition['name'],
            'domain' => $definition['domain'],
            'placeholders' => $definition['placeholders'],
            'sample_data' => $definition['sample_data'],
            'is_active' => (bool) ($rows->first()?->is_active ?? true),
            'templates' => collect(self::LOCALES)
                ->mapWithKeys(fn (string $locale) => [
                    $locale => [
                        'subject' => $rows[$locale]->subject ?? $this->fallbackSubject($event, $channel, $locale),
                        'body' => $rows[$locale]->body ?? $this->fallbackBody($event, $channel, $locale),
                    ],
                ])
                ->all(),
        ];
    }

    public function update(string $event, string $channel, array $payload, User $actor): array
    {
        $this->ensureEditable($event, $channel);
        $templates = $payload['templates'] ?? [];
        $this->validateTemplates($event, $channel, $templates);

        // TCK-748 — seules les langues modifiées sont persistées. Une langue sans ligne et dont le
        // texte reçu est encore celui de `lang/{locale}` reste sans ligne : `renderActive()` la
        // laisse alors à la notification d'origine, au lieu d'une copie figée du texte de départ.
        $rows = NotificationTemplate::query()
            ->where('event', $event)
            ->where('channel', $channel)
            ->get()
            ->keyBy('locale');
        $isActive = (bool) ($payload['is_active'] ?? true);

        foreach (self::LOCALES as $locale) {
            $row = $rows[$locale] ?? null;
            $data = $templates[$locale] ?? null;
            if ($data === null) {
                $row?->update(['is_active' => $isActive, 'updated_by_id' => $actor->id]);

                continue;
            }
            $subject = $data['subject'] ?? null;
            $body = (string) ($data['body'] ?? '');
            $untouched = (string) $subject === $this->fallbackSubject($event, $channel, $locale)
                && $body === $this->fallbackBody($event, $channel, $locale);
            // Désactiver un gabarit jamais modifié écrit la ligne `fr`, qui porte l'état.
            $carriesState = $locale === 'fr' && ! $isActive && $rows->isEmpty();
            if (! $row && $untouched && ! $carriesState) {
                continue;
            }
            NotificationTemplate::updateOrCreate(
                ['event' => $event, 'channel' => $channel, 'locale' => $locale],
                [
                    'subject' => $subject,
                    'body' => $body,
                    'is_active' => $isActive,
                    'updated_by_id' => $actor->id,
                ],
            );
        }

        activity('Admin')
            ->causedBy($actor)
            ->withProperties(['event' => $event, 'channel' => $channel])
            ->event('super_admin_notification_template_updated')
            ->log('Template de notification modifié');

        return $this->get($event, $channel);
    }

    public function preview(string $event, string $channel, string $locale, array $sampleData = []): array
    {
        $detail = $this->get($event, $channel);
        $data = array_replace_recursive($detail['sample_data'], $sampleData);
        $template = $detail['templates'][$locale] ?? $detail['templates']['fr'];

        return [
            'event' => $event,
            'channel' => $channel,
            'locale' => $locale,
            'subject' => $this->renderString((string) ($template['subject'] ?? ''), $data),
            'body' => $this->renderString((string) $template['body'], $data),
        ];
    }

    public function renderActive(string $event, string $channel, string $locale, array $data, array $fallback): array
    {
        $row = NotificationTemplate::query()
            ->where('event', $event)
            ->where('channel', $channel)
            ->where('locale', $locale)
            ->where('is_active', true)
            ->first();

        if (! $row) {
            return $fallback;
        }

        return [
            'subject' => $this->renderString((string) $row->subject, $data),
            'body' => $this->renderString($row->body, $data),
        ];
    }

    private function ensureEditable(string $event, string $channel): void
    {
        if (! EditableNotificationEvents::has($event)) {
            throw ValidationException::withMessages(['event' => 'notification_event_not_editable']);
        }
        if (! in_array($channel, EditableNotificationEvents::CHANNELS, true)) {
            throw ValidationException::withMessages(['channel' => 'notification_channel_not_editable']);
        }
    }

    private function validateTemplates(string $event, string $channel, array $templates): void
    {
        if (! isset($templates['fr']['body']) || trim((string) $templates['fr']['body']) === '') {
            throw ValidationException::withMessages(['templates.fr.body' => 'required']);
        }
        $allowed = EditableNotificationEvents::get($event)['placeholders'];
        foreach ($templates as $locale => $template) {
            foreach (['subject', 'body'] as $field) {
                $content = (string) ($template[$field] ?? '');
                preg_match_all('/{{\s*([a-zA-Z0-9_.]+)\s*}}/', $content, $matches);
                foreach ($matches[1] ?? [] as $placeholder) {
                    if (! in_array($placeholder, $allowed, true)) {
                        throw ValidationException::withMessages(["templates.{$locale}.{$field}" => "unknown_placeholder:{$placeholder}"]);
                    }
                }
                if ($channel === 'sms' && $field === 'body' && mb_strlen($content) > 960) {
                    throw ValidationException::withMessages(["templates.{$locale}.body" => 'sms_too_long']);
                }
            }
        }
    }

    private function renderString(string $template, array $data): string
    {
        return preg_replace_callback('/{{\s*([a-zA-Z0-9_.]+)\s*}}/', fn (array $match) => (string) data_get($data, $match[1], ''), $template) ?? $template;
    }

    private function fallbackSubject(string $event, string $channel, string $locale): string
    {
        if ($channel === 'sms') {
            return '';
        }

        return $this->langText($event, 'subject', $locale);
    }

    private function fallbackBody(string $event, string $channel, string $locale): string
    {
        return $this->langText($event, 'body', $locale);
    }

    /**
     * TCK-748 — texte de départ lu dans `lang/{locale}/notifications.php`, et non plus du français
     * en dur pour les trois langues.
     */
    private function langText(string $event, string $field, string $locale): string
    {
        $key = "notifications.editable_templates.{$event}.{$field}";
        $text = __($key, [], $locale);

        return is_string($text) && $text !== $key ? $text : EditableNotificationEvents::get($event)['name'];
    }
}
