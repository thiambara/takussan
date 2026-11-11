<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\Concerns\BorneLesReglesDElement;
use App\Rules\TelephoneJoignable;
use App\Services\Auth\PhoneChangeGuard;
use Illuminate\Foundation\Http\FormRequest;

/**
 * TCK-253 — Partial update for the authenticated user's lightweight
 * personalisation fields. All fields are optional; only the supplied
 * keys are persisted.
 */
class UpdateMeRequest extends FormRequest
{
    // TCK-2488 — une liste hors de sa borne ne fait pas valider ses éléments un à un (hérité de
    // BaseFormRequest pour les autres).
    use BorneLesReglesDElement;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Les champs qui vivent dans la colonne JSON `preferences`.
     *
     * ⚠ **TCK-493 — cette constante existe pour n'être écrite qu'UNE fois.** La
     * liste était en double : ici, dans `rules()`, et là-bas dans la boucle
     * `foreach (['city', 'search_intent'])` de {@see MeController::update()}.
     * Ajouter une clé à la validation sans l'ajouter à la boucle produit le
     * pire des cas — la requête est ACCEPTÉE (200), rien n'est enregistré, et
     * aucune erreur ne le dit. C'est le motif de recopie que TCK-492 et TCK-498
     * viennent de payer deux fois sur les rôles ; on ne le laisse pas s'installer
     * ici.
     *
     * @var list<string>
     */
    public const PREFERENCE_FIELDS = ['city', 'search_intent', 'entry_intent', 'navigation'];

    /**
     * TCK-2480 (ADR-0089 §6) — les huit personas du menu de `/app`. Le persona est un concept du
     * FRONT (`takussan-web/src/lib/navigation/personas.ts`) : l'API n'en connaît que les noms, pour
     * refuser une clé inconnue. `tests/fixtures/preferences-navigation.json` les porte, et les deux
     * tests de parité (Laravel et zod) les comparent chacun à leur liste.
     *
     * @var list<string>
     */
    public const PERSONAS_DU_MENU = ['client', 'locataire', 'bailleur', 'agent', 'admin-agence', 'hote', 'prestataire', 'plateforme'];

    /** TCK-2480 — un identifiant de destination ou de groupe du menu : court, en kebab-case ASCII. */
    private const IDENTIFIANT_DU_MENU = ['string', 'max:64', 'regex:/^[a-z0-9-]+$/'];

    public function rules(): array
    {
        return [
            // Same E.164 contract as UpdateProfileRequest. Empty string is
            // accepted and treated as "clear" by the controller.
            'phone' => ['sometimes', 'nullable', 'string', 'regex:/^(?:\+[1-9]\d{6,14})?$/', new TelephoneJoignable],
            'city' => ['sometimes', 'nullable', 'string', 'max:120'],
            // Free-form enum at the API layer — stored as a string. The
            // ranking pipeline (out of scope here, see TCK-253 hors-périmètre)
            // is the consumer that interprets the value.
            'search_intent' => ['sometimes', 'nullable', 'string', 'in:rent,buy,both'],
            // TCK-493 — la réponse à la question d'orientation posée juste après
            // la création du compte. Elle ORIENTE et n'attribue rien : aucun
            // profil n'est créé, aucune capacité accordée. `skipped` est une
            // réponse à part entière — c'est elle qui empêche de reposer la
            // question à quelqu'un qui a choisi de passer.
            // TCK-2607 — `professional` : la porte du professionnel (agence, agent, prestataire).
            // Elle oriente comme les autres et n'accorde aucun profil.
            'entry_intent' => ['sometimes', 'nullable', 'string', 'in:search,publish,professional,skipped'],
            // TCK-2480 (ADR-0089 §6) — épingles et replis du menu de `/app`, PAR PERSONA. L'API n'en
            // valide que la FORME : le catalogue des destinations appartient au front. Chaque niveau
            // liste ses clés (`array:…`) et les scalaires sont stricts : le contrôleur stocke
            // `input()`, pas `validated()` — une clé de plus serait enregistrée —, et Laravel
            // accepterait sinon ce que zod refuse (`"1"`, `1` pour un booléen, `{}`), ce que la
            // fixture de parité dirait.
            'navigation' => ['sometimes', 'nullable', 'array:v,personas', 'required_array_keys:v,personas'],
            'navigation.v' => ['required_with:navigation', 'integer:strict', 'in:1'],
            'navigation.personas' => ['array:'.implode(',', self::PERSONAS_DU_MENU)],
            'navigation.personas.*' => ['array:epingles,replies,ouverts,demarrer_masque'],
            'navigation.personas.*.epingles' => ['list', 'max:5'],
            'navigation.personas.*.epingles.*' => self::IDENTIFIANT_DU_MENU,
            'navigation.personas.*.replies' => ['list', 'max:20'],
            'navigation.personas.*.replies.*' => self::IDENTIFIANT_DU_MENU,
            'navigation.personas.*.ouverts' => ['list', 'max:20'],
            'navigation.personas.*.ouverts.*' => self::IDENTIFIANT_DU_MENU,
            'navigation.personas.*.demarrer_masque' => ['boolean:strict'],
            // TCK-655 (P06.01) — le sélecteur de langue du front persiste ici le choix : la langue
            // des e-mails, SMS et notifications suit `User::preferredLocale()`. Une colonne, pas
            // une clé de `preferences` : elle n'entre donc pas dans PREFERENCE_FIELDS.
            'preferred_language' => ['sometimes', 'string', 'in:fr,en,wo'],
            // TCK-1497 (P107.03) — le fuseau du compte, que lisent les rendus de notifications, les
            // rappels de visite et l'heure du résumé. Une colonne, comme la langue.
            'timezone' => ['sometimes', 'string', 'timezone:all'],
            // TCK-2506 — paraître dans l'annuaire public des propriétaires. Une colonne hors
            // `$fillable` : seul le compte lui-même l'écrit, ici.
            'listed_in_public_directory' => ['sometimes', 'boolean:strict'],
            // TCK-589 p3-1 — la preuve qu'exige le remplacement d'un numéro vérifié.
            ...PhoneChangeGuard::PROOF_RULES,
        ];
    }

    public function messages(): array
    {
        return [
            'phone.regex' => __('validation.rules.phone_e164'),
        ];
    }
}
