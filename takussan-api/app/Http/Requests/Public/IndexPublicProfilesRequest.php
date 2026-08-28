<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Validation\Rule;
use LogicException;

/**
 * Les paramètres des DEUX index publics de profils — TCK-436.
 *
 * `GET /api/public/agencies` et `GET /api/public/agents` prennent exactement les mêmes : une
 * recherche par nom, un filtre par ville, un tri, une pagination. Une classe par endpoint aurait
 * dupliqué quatre règles pour n'en spécialiser aucune ; c'est le tri dont les valeurs diffèrent, et
 * il est passé par le contrôleur ({@see self::TRIS_AGENCES}, {@see self::TRIS_AGENTS}).
 *
 * ⚠ **`sort` est validé ICI en plus d'être restreint par `allowedSorts()` côté spatie**, et ce
 * n'est pas une redondance : spatie lève `InvalidSortQuery` — une 400 dont le corps énumère les
 * tris admis à un appelant anonyme. La validation rend un 422 uniforme avec le reste de l'API.
 */
class IndexPublicProfilesRequest extends BaseFormRequest
{
    /**
     * Le plafond de `per_page`, sur une route ANONYME qui énumère des personnes.
     *
     * `PublicPropertyController::index()` n'en pose aucun (`paginate((int) $request->input(
     * 'per_page', 20))`, mesuré le 2026-08-27) et c'est une invitation à demander le catalogue
     * entier d'un coup. Un index de profils est le vecteur de moisson que la redaction de
     * `PublicAgencyController` visait déjà (TCK-441) : le plafond en est la moitié structurelle,
     * l'autre étant l'absence pure et simple de champ de contact dans la sortie.
     */
    public const PER_PAGE_MAX = 48;

    public const PER_PAGE_DEFAUT = 24;

    /** Les tris admis sur `/public/agencies`. */
    public const TRIS_AGENCES = ['portfolio_count', '-portfolio_count', 'name', '-name'];

    /** Les tris admis sur `/public/agents`. */
    public const TRIS_AGENTS = ['portfolio_count', '-portfolio_count', 'last_name', '-last_name'];

    /**
     * Lecture publique anonyme : la question n'est pas « qui a le droit » mais « qu'est-ce qui est
     * publiable », et elle se tranche dans la requête d'éligibilité du contrôleur.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::PER_PAGE_MAX],
            // `filter[search]` et `filter[city]` — la forme de `spatie/laravel-query-builder`.
            'filter' => ['nullable', 'array'],
            'filter.search' => ['nullable', 'string', 'max:120'],
            // 255 = la longueur de `addresses.city` en base. Une valeur plus longue ne peut
            // apparier aucune ligne : la refuser évite un `LIKE` sur toute la table pour rien.
            'filter.city' => ['nullable', 'string', 'max:255'],
            'sort' => ['nullable', 'string', Rule::in($this->trisAdmis())],
        ];
    }

    /**
     * Les tris admis pour la route COURANTE — dérivés du nom de route, jamais passés en argument.
     *
     * Un `FormRequest` est résolu par le conteneur avant l'action : il ne peut pas recevoir de
     * paramètre du contrôleur. Lire le nom de route est ce qui permet aux deux endpoints de
     * partager la classe sans partager leurs tris — et le `match` **n'a pas de branche
     * fourre-tout** : brancher cette requête sur une troisième route sans décider de ses tris
     * lève, au lieu d'hériter en silence de ceux des agences.
     *
     * @return array<int,string>
     */
    public function trisAdmis(): array
    {
        return match ($this->route()?->getName()) {
            'public.agencies.index' => self::TRIS_AGENCES,
            'public.agents.index' => self::TRIS_AGENTS,
            default => throw new LogicException(
                'IndexPublicProfilesRequest est branchée sur la route « '.
                ($this->route()?->getName() ?? '(sans nom)').
                ' », dont les tris ne sont pas déclarés.'
            ),
        };
    }

    /**
     * La taille de page effective, bornée.
     *
     * ⚠ Elle **ne s'appelle pas `perPage()`** : `scripts/check-pagination-envelope.mjs` (règle B)
     * réserve ce nom, parce que 40 contrôleurs reconstruisaient l'enveloppe de pagination à la
     * main autour de `->perPage()` (TCK-304, dette D-31). La garde cherche une FORME, pas un
     * fichier — elle a donc attrapé cette méthode-ci, qui est parfaitement légitime. *Un nom
     * réservé qui n'attrape que les coupables n'attraperait pas grand-chose.*
     */
    public function tailleDePage(): int
    {
        $demande = $this->input('per_page');

        if ($demande === null) {
            return self::PER_PAGE_DEFAUT;
        }

        return max(1, min((int) $demande, self::PER_PAGE_MAX));
    }

    public function recherche(): ?string
    {
        $valeur = $this->input('filter.search');

        return is_string($valeur) && $valeur !== '' ? $valeur : null;
    }

    public function ville(): ?string
    {
        $valeur = $this->input('filter.city');

        return is_string($valeur) && $valeur !== '' ? $valeur : null;
    }
}
