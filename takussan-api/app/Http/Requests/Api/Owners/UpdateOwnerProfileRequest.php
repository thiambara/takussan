<?php

namespace App\Http\Requests\Api\Owners;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PaymentMethod;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Policies\OwnerProfilePolicy;
use App\Rules\JourIso;
use App\Rules\PersonnelDeLAgence;
use App\Support\AgencyKindGuard;
use Carbon\CarbonImmutable;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * TCK-2640 — `PATCH /api/owners/{ownerProfile}` : le plafond de travaux du bailleur (ADR-0037).
 *
 * TCK-2909 — et les termes du mandat de gestion : dates, moyen et jour de versement (« avant le N du
 * mois »), référent. Même capacité (`owners.update`) : ce sont les réglages du mandat.
 *
 * Même ordre que la fiche ({@see ShowOwnerProfileRequest}) : 404 hors de l'agence, puis 403 sans
 * `owners.update`, puis 403 pour une agence `individual`, et seulement alors 422 — un appelant sans
 * droit n'apprend rien du contrat.
 *
 * Chaque clé est facultative, et seule une clé ENVOYÉE s'écrit : régler le mandat ne touche pas au
 * plafond. Un corps sans aucune clé connue reste un 422 (il ne vaut pas « tout retirer »). `null` retire
 * explicitement une valeur ; pour le plafond, « aucun accord exigé » (`OwnerApprovalThreshold::of()`),
 * `0` exige l'accord du bailleur pour tout devis non nul (le plafond est dépassé strictement).
 *
 * Les dates se jugent contre la valeur EN BASE de l'autre borne quand une seule est envoyée : la fin
 * n'est jamais avant le début. Le référent est du personnel actif de l'agence du bailleur
 * ({@see PersonnelDeLAgence}).
 */
class UpdateOwnerProfileRequest extends BaseFormRequest
{
    /** TCK-2909 — les clés que la route écrit. */
    public const KEYS = ['works_approval_threshold', 'mandate_starts_on', 'mandate_ends_on', 'payout_method', 'payout_day', 'referent_agent_id'];

    public function authorize(): bool
    {
        $user = $this->user();
        $profile = $this->profile();
        abort_unless($user !== null && OwnerProfilePolicy::isInActorAgency($user, $profile), 404);
        if (! $user->can('update', $profile)) {
            return false;
        }
        AgencyKindGuard::ensureStandardForNonGlobal($user, (int) $profile->agency_id);

        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // decimal(14,2) : au plus 12 chiffres avant la virgule.
            'works_approval_threshold' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:999999999999.99'],
            // TCK-2909
            'mandate_starts_on' => ['sometimes', 'nullable', 'date', new JourIso],
            'mandate_ends_on' => ['sometimes', 'nullable', 'date', new JourIso],
            'payout_method' => ['sometimes', 'nullable', Rule::enum(PaymentMethod::class)],
            'payout_day' => ['sometimes', 'nullable', 'integer', 'between:1,28'],
            'referent_agent_id' => ['sometimes', 'nullable', 'integer', function (string $attribute, mixed $value, \Closure $fail): void {
                $agent = is_int($value) || (is_string($value) && ctype_digit($value)) ? User::query()->find((int) $value) : null;
                if (! PersonnelDeLAgence::estPersonnel($agent, $this->profile()->agency_id)) {
                    $fail(__('owners.mandate.referent_not_staff'));
                }
            }],
        ];
    }

    /** @return array<int, callable(Validator): void> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            // Un corps sans aucune clé connue (`null` est une valeur : il retire).
            if (! $this->hasAny(self::KEYS)) {
                $validator->errors()->add('works_approval_threshold', __('owners.mandate.nothing_to_update'));

                return;
            }
            if ($validator->errors()->hasAny(['mandate_starts_on', 'mandate_ends_on'])) {
                return;
            }
            if (! $this->has('mandate_starts_on') && ! $this->has('mandate_ends_on')) {
                return;
            }
            $profile = $this->profile();
            $start = $this->has('mandate_starts_on') ? $this->input('mandate_starts_on') : $profile->mandate_starts_on?->toDateString();
            $end = $this->has('mandate_ends_on') ? $this->input('mandate_ends_on') : $profile->mandate_ends_on?->toDateString();
            if (is_string($start) && is_string($end) && CarbonImmutable::parse($end)->lt(CarbonImmutable::parse($start))) {
                $validator->errors()->add($this->has('mandate_ends_on') ? 'mandate_ends_on' : 'mandate_starts_on', __('owners.mandate.ends_before_start'));
            }
        }];
    }

    public function profile(): OwnerProfile
    {
        /** @var OwnerProfile $profile */
        $profile = $this->route('ownerProfile');

        return $profile;
    }
}
