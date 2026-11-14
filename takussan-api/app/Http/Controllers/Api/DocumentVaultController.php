<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\DocumentVaultArchiveRequest;
use App\Http\Requests\Api\DocumentVaultRequest;
use App\Models\Lease;
use App\Models\Property;
use App\Services\Documents\ArchiveDuCoffre;
use App\Services\Documents\DocumentVault;
use App\Support\Http\ParametreUnique;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * TCK-2655 (ADR-0099 §2-3) — le coffre de documents et les documents générés d'une cible.
 *
 *  - `GET /api/me/document-vault` : les dossiers de l'appelant selon son profil actif, leurs entrées
 *    `uploaded` et `generated`, les comptes `expiring_soon` / `unverified`, et `attachable_targets`.
 *    Chaque dossier porte `read_only` : vrai pour les biens d'un profil propriétaire bloqué (TCK-2729).
 *    Avec `filter[search]` (TCK-2769) : les entrées de ce même coffre qui correspondent, à plat,
 *    chacune avec son `folder`, paginées par le serveur (`page`, `per_page`, `meta`).
 *  - `GET /api/me/document-vault/archive?folder=` (TCK-2770) : l'archive `.zip` d'un dossier de ce même
 *    coffre, exactement ses entrées ({@see ArchiveDuCoffre}). Refusée sous impersonation (ADR-0055 §3).
 *  - `GET /api/documents/generated?target=lease:{id}|property:{id}` : les entrées générées d'une
 *    cible que l'appelant lit (`view` du bail ou du bien), chacune jugée par son endpoint.
 *
 * La règle de chaque entrée est celle de l'endpoint qui la sert ({@see DocumentVault}).
 */
class DocumentVaultController extends Controller
{
    public function __construct(private readonly DocumentVault $vault) {}

    public function show(DocumentVaultRequest $request): JsonResponse
    {
        $q = $request->recherche();
        if ($q !== null) {
            return $this->json($this->vault->search($request->user(), $request->activeProfile(), $q, $request->page(), $request->pageSize()));
        }

        return $this->json(['data' => $this->vault->for($request->user(), $request->activeProfile())]);
    }

    /**
     * TCK-2770 — l'archive est entièrement écrite avant la réponse : un refus rend son code, jamais un
     * `.zip` tronqué sous un 200. Le nom de l'archive est celui que le front propose ; celui-ci est neutre.
     */
    public function archive(DocumentVaultArchiveRequest $request, ArchiveDuCoffre $archive): StreamedResponse
    {
        ['stream' => $stream, 'size' => $size] = $archive->construire($request->user(), $request->activeProfile(), $request->folder());

        return new StreamedResponse(function () use ($stream): void {
            fpassthru($stream);
            fclose($stream);
        }, 200, [
            'Content-Type' => 'application/zip',
            'Content-Length' => (string) $size,
            'Content-Disposition' => 'attachment; filename="documents.zip"',
            'Cache-Control' => 'private, max-age=0, no-cache',
        ]);
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
