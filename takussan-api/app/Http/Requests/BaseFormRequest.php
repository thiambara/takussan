<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\BorneLesReglesDElement;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Log;

abstract class BaseFormRequest extends FormRequest
{
    // TCK-2488 — une liste hors de sa borne ne fait pas valider ses éléments un à un.
    use BorneLesReglesDElement;

    /**
     * Clés du corps que la requête reçoit sans règle, et qui ne doivent pas être signalées
     * (TCK-1446). Une exception se déclare ici, dans la sous-classe, avec sa raison.
     *
     * @var list<string>
     */
    protected array $unruledInputKeysAllowed = [];

    /** Clés que le framework pose lui-même et qu'aucune règle ne nomme. */
    private const ALWAYS_ALLOWED_INPUT_KEYS = ['_method', '_token'];

    /**
     * TCK-612 — clés qu'une ÉCRITURE accepte de lire dans la chaîne de requête, par exception.
     * Par défaut aucune : une écriture se valide sur le corps seul (cf. {@see validationData()}).
     * Une exception se déclare ici, dans la sous-classe, avec sa raison, et
     * `tests/Feature/Validation/QueryNeverFeedsAWriteTest.php` la recense.
     *
     * @var list<string>
     */
    protected array $queryKeysAcceptedOnWrite = [];

    /**
     * TCK-612 — clés de premier niveau que la query porte seule (absentes du corps), relevées
     * avant `prepareForValidation()`.
     *
     * @var list<string>|null
     */
    private ?array $queryOnlyKeys = null;

    /**
     * TCK-612 — ces clés, retirées de la query le temps de `prepareForValidation()`, et rendues
     * avant `authorize()`.
     *
     * @var array<string, mixed>|null
     */
    private ?array $hiddenQueryKeys = null;

    /**
     * TCK-1446 (P80.03) — une clé envoyée sans règle est écartée par `validated()` sans bruit :
     * c'est ainsi que le statut d'un client neuf et le nombre de voyageurs d'une réservation
     * se perdaient (P80.01, P80.02). En `local` et en `testing` seulement, ces clés sont
     * journalisées, de premier niveau, avec la route : le nom, jamais la valeur. Aucun effet sur
     * la réponse.
     *
     * Les clés se relèvent AVANT la validation : `prepareForValidation()` réécrit le corps.
     *
     * TCK-612 — pour une écriture, `prepareForValidation()` — celui-ci comme celui d'une
     * sous-classe, qui lit `input()`/`has()` puis `merge()` (`LoginRequest`, `InviteAgentRequest`…)
     * — s'exécute sans les clés que la query porte seule : elle ne peut pas recopier une valeur de
     * l'URL dans le corps. La query est rendue avant `authorize()` (cf. {@see passesAuthorization()}).
     */
    public function validateResolved(): void
    {
        $this->rememberQueryOnlyKeys();
        $sent = app()->environment(['local', 'testing']) ? $this->sentBodyKeys() : [];

        $this->hideQueryOnlyKeys();
        try {
            parent::validateResolved();
        } finally {
            $this->restoreHiddenQueryKeys();
        }

        $this->signalUnruledInputKeys($sent);
    }

    /** TCK-612 — `authorize()` lit la requête entière : la query cachée lui est rendue. */
    protected function passesAuthorization()
    {
        $this->restoreHiddenQueryKeys();

        return parent::passesAuthorization();
    }

    /** @return list<string> */
    private function sentBodyKeys(): array
    {
        $queryOnly = array_diff($this->query->keys(), $this->request->keys());

        return array_values(array_diff(
            array_map('strval', array_merge($this->getInputSource()->keys(), array_keys($this->allFiles()))),
            array_map('strval', $queryOnly),
        ));
    }

    /** @param  list<string>  $sent */
    private function signalUnruledInputKeys(array $sent): void
    {
        if ($sent === []) {
            return;
        }

        $rules = method_exists($this, 'rules') ? $this->container->call([$this, 'rules']) : [];
        $ruled = [];
        foreach (array_keys($rules) as $rule) {
            $ruled[strtok((string) $rule, '.')] = true;
        }

        $unruled = array_values(array_unique(array_filter(
            $sent,
            fn (string $key) => ! isset($ruled[$key])
                && ! in_array($key, self::ALWAYS_ALLOWED_INPUT_KEYS, true)
                && ! in_array($key, $this->unruledInputKeysAllowed, true),
        )));

        if ($unruled !== []) {
            Log::warning('form_request.unruled_input_keys', [
                'request' => static::class,
                'route' => $this->route()?->uri(),
                'keys' => $unruled,
            ]);
        }
    }

    public function authorize(): bool
    {
        return false;
    }

    /**
     * TCK-612 — une écriture (`POST`, `PUT`, `PATCH`, `DELETE`) normalise son CORPS seul : `input()`
     * y fusionnait la query, et `replace()` la réécrivait dans le corps — un champ venu d'une URL
     * réécrite devenait un champ saisi. Une lecture (`GET`, `HEAD`) garde la forme d'origine : sa
     * source d'entrée EST la query.
     */
    protected function prepareForValidation(): void
    {
        if ($this->isMethodSafe()) {
            $this->replace($this->normalize($this->input()));

            return;
        }

        $corps = $this->getInputSource();
        $corps->replace($this->normalize($corps->all()));
    }

    /**
     * TCK-612 — une écriture se valide sur le corps seul (fichiers compris), plus les seules clés de
     * query que la sous-classe déclare dans {@see $queryKeysAcceptedOnWrite}. C'est la condition
     * qui rendait verif-600 B1-bis exploitable (`POST …/impersonate?reason=…` sous n'importe quel
     * corps). Une lecture garde `all()`.
     *
     * @return array<string, mixed>
     */
    public function validationData(): array
    {
        if ($this->isMethodSafe()) {
            return parent::validationData();
        }

        $corps = array_replace_recursive($this->getInputSource()->all(), $this->allFiles());

        return $corps + array_intersect_key($this->query->all(), array_flip($this->queryKeysAcceptedOnWrite));
    }

    /**
     * TCK-612 — au-delà de `validated()` : une écriture lit aussi ses champs par `input()`,
     * `boolean()`… — qui fusionnent la query — dans `withValidator()` ou dans le contrôleur. Une
     * fois les règles connues, chaque champ RÉGLÉ que la query portait seule en est retiré. Les
     * paramètres sans règle (`include`, `fields`, `lang`…) restent lisibles.
     *
     * @return Validator
     */
    protected function getValidatorInstance()
    {
        $neuf = $this->validator === null;
        $validator = parent::getValidatorInstance();

        if ($neuf && ! $this->isMethodSafe() && method_exists($validator, 'getRules')) {
            $regles = [];
            foreach (array_keys($validator->getRules()) as $regle) {
                $regles[strtok((string) $regle, '.')] = true;
            }
            foreach ($this->queryOnlyKeysNotAccepted() as $cle) {
                if (isset($regles[$cle])) {
                    $this->query->remove($cle);
                }
            }
        }

        return $validator;
    }

    /** TCK-612 — à appeler avant `prepareForValidation()` ; sans effet au second appel. */
    protected function rememberQueryOnlyKeys(): void
    {
        $this->queryOnlyKeys ??= $this->isMethodSafe() ? [] : array_values(array_diff(
            array_map('strval', $this->query->keys()),
            array_map('strval', $this->getInputSource()->keys()),
        ));
    }

    /** TCK-612 — retire de la query, le temps de `prepareForValidation()`, les clés qu'elle porte seule. */
    protected function hideQueryOnlyKeys(): void
    {
        if ($this->hiddenQueryKeys !== null) {
            return;
        }

        $this->hiddenQueryKeys = [];
        foreach ($this->queryOnlyKeysNotAccepted() as $cle) {
            $this->hiddenQueryKeys[$cle] = $this->query->all()[$cle];
            $this->query->remove($cle);
        }
    }

    /** TCK-612 — rend à la query les clés cachées ; sans effet si rien n'est caché. */
    protected function restoreHiddenQueryKeys(): void
    {
        if ($this->hiddenQueryKeys === null) {
            return;
        }

        $this->query->add($this->hiddenQueryKeys);
        $this->hiddenQueryKeys = null;
    }

    /** @return list<string> */
    private function queryOnlyKeysNotAccepted(): array
    {
        $this->rememberQueryOnlyKeys();

        return array_values(array_diff($this->queryOnlyKeys ?? [], $this->queryKeysAcceptedOnWrite));
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    protected function normalize(array $input): array
    {
        foreach ($input as $key => $value) {
            if (is_array($value)) {
                $input[$key] = $this->normalize($value);

                continue;
            }

            if (is_string($value)) {
                $trimmed = trim($value);
                $input[$key] = $trimmed === '' ? null : $trimmed;
            }
        }

        return $input;
    }
}
