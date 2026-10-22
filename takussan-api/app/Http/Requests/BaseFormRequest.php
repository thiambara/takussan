<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Log;

abstract class BaseFormRequest extends FormRequest
{
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
     * TCK-1446 (P80.03) — une clé envoyée sans règle est écartée par `validated()` sans bruit :
     * c'est ainsi que le statut d'un client neuf et le nombre de voyageurs d'une réservation
     * se perdaient (P80.01, P80.02). En `local` et en `testing` seulement, ces clés sont
     * journalisées, de premier niveau, avec la route : le nom, jamais la valeur. Aucun effet sur
     * la réponse.
     *
     * Les clés se relèvent AVANT la validation : `prepareForValidation()` remplace le corps par
     * `input()`, qui y fusionne la chaîne de requête (`include`, `fields`…, qui n'ont pas de
     * règle) pour un formulaire non JSON.
     */
    public function validateResolved(): void
    {
        $sent = app()->environment(['local', 'testing']) ? $this->sentBodyKeys() : [];

        parent::validateResolved();

        $this->signalUnruledInputKeys($sent);
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

    protected function prepareForValidation(): void
    {
        $this->replace($this->normalize($this->input()));
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
