<?php

namespace App\Exceptions;

use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * TCK-588 (ADR-0032) — une erreur métier : un statut, un CODE stable, des paramètres.
 *
 * Le corps rendu par `bootstrap/app.php` est `{code, message, params?}`, où `message` est
 * `__('errors.<code>', $params)` dans la langue négociée de la requête. Le message de l'exception
 * (`getMessage()`) vaut le code : il sert aux journaux, il n'atteint jamais un corps de réponse.
 *
 * On ne l'instancie pas à la main : `abort_code()`, `abort_code_if()`, `abort_code_unless()`
 * (`app/Support/helpers.php`). Le code est un littéral `^[a-z0-9_]+(\.[a-z0-9_]+)+$` dont la clé
 * existe dans `lang/{fr,en,wo}/errors.php` — `tests/Unit/Lang/LangGroupParityTest.php` le vérifie.
 */
class ApiError extends HttpException
{
    public const CODE_SHAPE = '/^[a-z0-9_]+(\.[a-z0-9_]+)+$/';

    /**
     * Des données à rendre à côté du code, au premier niveau du corps (`profiles` d'un rôle encore
     * attribué, `maintenance` d'une maintenance en cours) : jamais de texte.
     *
     * @var array<string, mixed>
     */
    public array $extra = [];

    /**
     * @param  array<string, scalar|list<scalar>|null>  $params
     * @param  array<string, string>  $headers
     */
    public function __construct(
        int $status,
        public readonly string $errorCode,
        public readonly array $params = [],
        array $headers = [],
    ) {
        parent::__construct($status, $errorCode, null, $headers);
    }

    /**
     * `throw (new ApiError(409, 'agency_role.in_use'))->with(['profiles' => $blocking]);`
     *
     * @param  array<string, mixed>  $extra
     */
    public function with(array $extra): static
    {
        $this->extra = $extra + $this->extra;

        return $this;
    }

    /** Le message localisé, dans la langue courante (celle de la requête) sauf mention contraire. */
    public function localizedMessage(?string $locale = null): string
    {
        return __('errors.'.$this->errorCode, $this->replacements(), $locale);
    }

    /**
     * Les paramètres tels que `__()` les accepte : une liste devient une énumération.
     *
     * @return array<string, string>
     */
    private function replacements(): array
    {
        return array_map(
            fn ($value) => is_array($value) ? implode(', ', $value) : (string) $value,
            $this->params,
        );
    }
}
