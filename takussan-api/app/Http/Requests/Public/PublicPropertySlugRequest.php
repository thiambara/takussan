<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;

/**
 * TCK-305 — base des deux actions publiques dont les RÈGLES dépendent du bien visé.
 *
 * **Pourquoi le bien est résolu ici et pas seulement dans le contrôleur.** Les deux actions
 * chargeaient le bien par `firstOrFail()` **avant** de valider : un slug inconnu rendait 404, et
 * le corps du message n'était même pas regardé. La validation d'un FormRequest court avant le
 * corps du contrôleur — laisser la résolution au contrôleur aurait donc transformé ce 404 en 422
 * pour tout appel portant à la fois un slug inconnu et un corps fautif. *Un déplacement de code
 * qui change un code de réponse n'est pas un déplacement.*
 *
 * La résolution est mémoïsée et le contrôleur la relit par `$request->property()` : il n'y a
 * donc **pas** de requête supplémentaire — il y en a une de moins qu'avant.
 */
abstract class PublicPropertySlugRequest extends BaseFormRequest
{
    private ?Property $property = null;

    /**
     * Route publique : il n'y a rien à autoriser, le périmètre est le catalogue publié.
     * `BaseFormRequest` refuse par défaut — *fail-closed* — d'où cette surcharge.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Le bien publié désigné par le `{slug}` de la route — 404 s'il n'existe pas, exactement
     * comme le `firstOrFail()` que le contrôleur faisait en tête de méthode.
     */
    public function property(): Property
    {
        return $this->property ??= Property::query()
            ->public()
            ->whereNot('status', PropertyStatus::Draft)
            ->where('slug', (string) $this->route('slug'))
            ->firstOrFail();
    }
}
