<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\Api\Admin\UpdateRadarListingRequest;
use App\Http\Requests\BaseFormRequest;
use App\Support\PhoneMasker;
use Closure;
use Illuminate\Translation\PotentiallyTranslatedString;

/**
 * TCK-2390 (ADR-0077 §3) — `POST /api/radar/claims/{token}/confirm` : le code reçu, l'acceptation des conditions et leur
 * version (celle que la page a montrée : une page restée ouverte sur une version dépassée est refusée par le service), les
 * annonces retenues avec leurs corrections (titre, prix, description), le prénom et le nom de l'espace.
 *
 * Une liste vide n'est permise qu'à l'activation d'un compte déjà publié pour lui (le service en juge).
 */
class ConfirmRadarClaimRequest extends BaseFormRequest
{
    public const MAX_LISTINGS = 50;

    private const NO_MASK_TOKEN = 'not_regex:/\[TELEPHONE\]/';

    /** @param  Closure(string): PotentiallyTranslatedString  $fail */
    private static function noPhone(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) && PhoneMasker::mask($value) !== $value) {
            $fail('validation.not_regex')->translate();
        }
    }

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'max:12'],
            'accept_terms' => ['required', 'accepted'],
            'terms_version' => ['required', 'string', 'max:20'],
            'listings' => ['present', 'array', 'max:'.self::MAX_LISTINGS],
            'listings.*' => ['array:id,title,price,description'],
            'listings.*.id' => ['required', 'integer', 'distinct'],
            // Le texte montré a ses numéros masqués (`[TELEPHONE]`) : une correction qui garde le jeton publierait le jeton.
            'listings.*.title' => ['sometimes', 'nullable', 'string', 'max:200', self::NO_MASK_TOKEN],
            'listings.*.price' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:'.UpdateRadarListingRequest::MAX_PRICE],
            'listings.*.description' => ['sometimes', 'nullable', 'string', 'max:20000', self::NO_MASK_TOKEN],
            // Le prénom et le nom de l'espace deviennent publics : aucun numéro, sous aucune forme que le masqueur reconnaît.
            'first_name' => ['sometimes', 'nullable', 'string', 'max:60', self::noPhone(...)],
            'space_name' => ['sometimes', 'nullable', 'string', 'max:120', self::noPhone(...)],
            'device_name' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}
