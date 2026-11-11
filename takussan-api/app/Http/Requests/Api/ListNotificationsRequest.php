<?php

namespace App\Http\Requests\Api;

use App\Domain\Notifications\NotificationFamily;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Requests\BaseFormRequest;
use Closure;
use Illuminate\Validation\Rule;

/**
 * TCK-2633 — `GET /api/notifications` ({@see NotificationController::index()}) : ses trois filtres,
 * cumulables. `per_page` et `fields[app_notifications]` restent lus comme avant.
 *
 * `filter[famille]` est une liste : `visite,demande`, ou `filter[famille][]=…`. Une famille
 * inconnue, un `a_traiter` ou un `unread` qui ne sont pas des booléens sont une erreur du CLIENT :
 * 422, jamais un filtre ignoré en silence.
 */
class ListNotificationsRequest extends BaseFormRequest
{
    private const BOOLEENS = ['0', '1', 'true', 'false'];

    /** La route exige une session ; le contrôleur ne lit que les notifications de l'appelant. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $connues = array_map(static fn (NotificationFamily $f): string => $f->value, NotificationFamily::cases());

        return [
            'filter' => ['sometimes', 'array'],
            'filter.unread' => ['sometimes', 'nullable', Rule::in(self::BOOLEENS)],
            'filter.a_traiter' => ['sometimes', 'nullable', Rule::in(self::BOOLEENS)],
            'filter.famille' => [
                'sometimes', 'nullable',
                function (string $attribute, mixed $value, Closure $fail) use ($connues): void {
                    $valeurs = self::liste($value);
                    if ($valeurs === null || array_diff($valeurs, $connues) !== []) {
                        $fail('validation.in')->translate();
                    }
                },
            ],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'filter' => __('notifications.attributes.filters'),
            'filter.unread' => __('notifications.attributes.unread_filter'),
            'filter.a_traiter' => __('notifications.attributes.action_filter'),
            'filter.famille' => __('notifications.attributes.family_filter'),
        ];
    }

    /**
     * Les familles demandées, ou `[]` sans filtre.
     *
     * @return list<NotificationFamily>
     */
    public function familles(): array
    {
        return array_map(
            static fn (string $valeur): NotificationFamily => NotificationFamily::from($valeur),
            self::liste($this->validated('filter.famille')) ?? [],
        );
    }

    public function aTraiter(): bool
    {
        return in_array($this->validated('filter.a_traiter'), ['1', 'true'], true);
    }

    public function nonLues(): bool
    {
        return in_array($this->validated('filter.unread'), ['1', 'true'], true);
    }

    /**
     * `a,b` ou `[a, b]` → `[a, b]` ; `null` pour une forme qui n'est pas une liste de chaînes.
     *
     * @return list<string>|null
     */
    private static function liste(mixed $value): ?array
    {
        if ($value === null) {
            return [];
        }
        $morceaux = is_string($value) ? explode(',', $value) : $value;
        if (! is_array($morceaux) || array_filter($morceaux, static fn (mixed $m): bool => ! is_string($m)) !== []) {
            return null;
        }

        return array_values(array_unique(array_filter(array_map('trim', $morceaux), static fn (string $m): bool => $m !== '')));
    }
}
