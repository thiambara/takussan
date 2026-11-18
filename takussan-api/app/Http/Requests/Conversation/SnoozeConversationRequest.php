<?php

namespace App\Http\Requests\Conversation;

/**
 * TCK-2967 (ADR-0128 § 7) — « Rappelez-le-moi » : `{until}`, un instant futur, à
 * {@see self::JOURS_MAX} jours au plus.
 */
class SnoozeConversationRequest extends GesteDeLaBoiteRequest
{
    public const JOURS_MAX = 30;

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'until' => ['required', 'date', 'after:now', 'before_or_equal:'.now()->addDays(self::JOURS_MAX)->toIso8601String()],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['until' => __('messaging.attributes.snooze_until')];
    }
}
