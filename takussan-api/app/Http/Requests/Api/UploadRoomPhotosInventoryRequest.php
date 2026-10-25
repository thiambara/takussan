<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Inventory;
use App\Rules\PixelsAuPlus;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de InventoryController::uploadRoomPhotos(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class UploadRoomPhotosInventoryRequest extends BaseFormRequest
{
    /**
     * TCK-305 — l'autorisation court ICI, avant la validation.
     *
     * Le contrôleur autorisait avant de valider ; un FormRequest valide avant le corps du
     * contrôleur, ce qui rendait 422 là où l'API rendait 403 pour un appel à la fois non
     * autorisé et mal formé. `authorize()` rétablit l'ordre d'origine.
     *
     * **Simple DÉLÉGATION** : la règle vit dans sa policy, cette méthode ne fait que l'invoquer —
     * aucune règle d'autorisation n'a migré ici (AC4).
     */
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('inventory')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // TCK-2330 (P222.02) — 20 au plus, la borne `max_file_uploads` de l'image (`docker/php.ini`) :
            // au-delà, PHP ignore un fichier sans erreur, et le lot passait amputé (comme TCK-673).
            'photos' => ['required', 'array', 'min:1', 'max:20'],
            // TCK-1423 (P143.02) — 20 Mpx au plus : chaque PDF décode la photo dans GD, qui cède sur
            // `memory_limit` dans l'image de l'API (GD embarquée, TCK-1812 ; voir `PixelsAuPlus`).
            'photos.*' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120', new PixelsAuPlus],
            // TCK-596 — une photo appartient à une PIÈCE de cet état des lieux, pas à une chaîne libre.
            'room_name' => ['required', 'string', Rule::in($this->roomNames())],
        ];
    }

    /** @return list<string> */
    private function roomNames(): array
    {
        $inventory = $this->route('inventory');
        if (! $inventory instanceof Inventory) {
            return [];
        }

        return collect($inventory->rooms ?? [])
            ->map(fn ($room) => is_array($room) ? ($room['name'] ?? null) : null)
            ->filter(fn ($name) => is_string($name) && $name !== '')
            ->values()
            ->all();
    }
}
