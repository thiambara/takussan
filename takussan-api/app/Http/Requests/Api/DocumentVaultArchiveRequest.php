<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Services\Documents\ArchiveDuCoffre;

/**
 * TCK-2770 — `GET /api/me/document-vault/archive?folder=` : la clé d'un dossier du coffre, telle que
 * `GET /api/me/document-vault` la rend (`receipts:2026`, `lease:22`, `property:7`, `pieces`,
 * `statements`, `bills`). Toute autre forme est un 422 ; une clé bien formée qui n'est pas un dossier
 * du coffre de l'appelant est un 404 ({@see ArchiveDuCoffre}).
 *
 * `authorize()` rend vrai : la route est authentifiée, et l'archive ne prend que dans le coffre de
 * l'appelant, déjà jugé entrée par entrée ; le contrôleur n'autorise rien avant de valider.
 */
class DocumentVaultArchiveRequest extends BaseFormRequest
{
    public const FORME = '/^(receipts:[0-9]{4}|(lease|property):[0-9]{1,18}|pieces|statements|bills)$/';

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'folder' => ['required', 'string', 'regex:'.self::FORME],
        ];
    }

    public function folder(): string
    {
        return (string) $this->validated('folder');
    }
}
