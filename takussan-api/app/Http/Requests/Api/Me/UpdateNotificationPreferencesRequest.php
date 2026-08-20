<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-305 — extrait de `NotificationPreferenceController::update()`, où les règles étaient
 * écrites en ligne.
 *
 * Ce site est le seul des 120 à porter **deux** appels à `$request->validate()` dans une même
 * méthode : la matrice groupée (n'était validée que si la clé `preferences` était envoyée) et le
 * chemin historique des booléens à plat (toujours validé). Un endpoint ne peut recevoir qu'un
 * FormRequest ; la conditionnalité passe donc dans `rules()`, où elle reste exactement la même.
 *
 * ⚠ **Un changement observable, et il va dans le bon sens** : deux `validate()` successifs
 * s'arrêtaient au premier échec, si bien qu'un corps fautif des deux côtés ne rapportait que la
 * moitié de ses erreurs. Le 422 est le même ; son corps est désormais complet.
 */
class UpdateNotificationPreferencesRequest extends BaseFormRequest
{
    /**
     * L'autorisation NE migre PAS ici : l'endpoint agit sur `$request->user()`, il n'y a pas
     * d'autre sujet à autoriser. `BaseFormRequest` refuse par défaut — *fail-closed* — donc sans
     * cette surcharge l'endpoint rendrait 403 pour tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Les trois clés du chemin historique, nommées une fois — le contrôleur en a besoin pour
     * séparer ce qu'il écrit sur `users` de ce qu'il passe au résolveur.
     *
     * @var list<string>
     */
    public const FLAT_KEYS = [
        'notifications_email_enabled',
        'notifications_push_enabled',
        'notifications_sms_enabled',
    ];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $rules = [
            'notifications_email_enabled' => ['sometimes', 'boolean'],
            'notifications_push_enabled' => ['sometimes', 'boolean'],
            'notifications_sms_enabled' => ['sometimes', 'boolean'],
        ];

        // La matrice groupée n'était validée que lorsqu'elle était envoyée — sinon `required`
        // aurait rendu 422 sur toute mise à jour du chemin historique.
        if ($this->has('preferences')) {
            $rules += [
                'preferences' => ['required', 'array'],
                'preferences.*.event_type' => ['required', 'string'],
                'preferences.*.channel' => ['required', 'string'],
                'preferences.*.enabled' => ['required', 'boolean'],
            ];
        }

        return $rules;
    }
}
