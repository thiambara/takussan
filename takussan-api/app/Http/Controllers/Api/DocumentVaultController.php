<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Lease;
use App\Models\Property;
use App\Services\Documents\DocumentVault;
use App\Support\Http\ParametreUnique;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2655 (ADR-0099 §2-3) — le coffre de documents et les documents générés d'une cible.
 *
 *  - `GET /api/me/document-vault` : les dossiers de l'appelant selon son profil actif, leurs entrées
 *    `uploaded` et `generated`, les comptes `expiring_soon` / `unverified`, et `attachable_targets`.
 *    Chaque dossier porte `read_only` : vrai pour les biens d'un profil propriétaire bloqué (TCK-2729).
 *  - `GET /api/documents/generated?target=lease:{id}|property:{id}` : les entrées générées d'une
 *    cible que l'appelant lit (`view` du bail ou du bien), chacune jugée par son endpoint.
 *
 * La règle de chaque entrée est celle de l'endpoint qui la sert ({@see DocumentVault}).
 */
class DocumentVaultController extends Controller
{
    public function __construct(private readonly DocumentVault $vault) {}

    public function show(Request $request): JsonResponse
    {
        return $this->json(['data' => $this->vault->for($request->user(), $request->activeProfile())]);
    }

    public function generated(Request $request): JsonResponse
    {
        $raw = ParametreUnique::chaine($request, 'target');
        abort_code_unless(
            $raw !== null && preg_match('/^(lease|property):([0-9]{1,18})$/', $raw, $m) === 1,
            422,
            'document.invalid_target',
        );

        $target = ($m[1] === 'lease' ? Lease::class : Property::class)::query()->find((int) $m[2]);
        abort_if($target === null, 404);
        $this->authorize('view', $target);

        return $this->json(['data' => $this->vault->generatedFor($request->user(), $target)]);
    }
}
