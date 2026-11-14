<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\DocumentVaultArchiveRequest;
use App\Http\Resources\DocumentVaultArchiveResource;
use App\Jobs\Documents\BatirLArchiveDuCoffreJob;
use App\Models\DocumentVaultArchive;
use App\Models\Enums\DocumentVaultArchiveStatus;
use App\Models\User;
use App\Services\Documents\ArchiveDuCoffre;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * TCK-2812 (ADR-0099, amendement du 2026-11-14) — l'archive PRÉPARÉE d'un dossier du coffre, au-delà du
 * seuil synchrone de TCK-2770 (`GET /api/me/document-vault/archive`, 40 entrées).
 *
 *  - `POST /api/me/document-vault/archives` (`folder`) : 202 et l'état de la préparation. La demande vérifie
 *    que le dossier est dans le coffre de l'appelant et dans les bornes, **sans en garder les entrées** :
 *    {@see BatirLArchiveDuCoffreJob} rejuge le coffre à la construction. Une demande identique en cours
 *    (même compte, même profil, même dossier) rend la préparation en cours et ne met rien de plus en file.
 *  - `GET /api/me/document-vault/archives` : les préparations de l'appelant sous son profil actif, la
 *    plus récente par dossier ; une prête porte son lien signé.
 *  - `GET /api/me/document-vault/archives/{uuid}/download` : le fichier, par un lien signé (relatif) ET au
 *    seul compte qui l'a demandé. Signature absente, fausse ou expirée, ou autre compte : 403 ; archive
 *    passée ou effacée : 410. Aucun octet de l'archive dans ces réponses.
 *
 * Sous impersonation, les trois sont refusées (ADR-0055 §3) : la demande est une écriture, l'état et le
 * téléchargement sont dans `EnforceImpersonationReadOnly::REFUSED_READS`.
 */
class DocumentVaultArchiveController extends Controller
{
    public function store(DocumentVaultArchiveRequest $request, ArchiveDuCoffre $archives): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $profil = $request->activeProfile();
        $dossier = $request->folder();

        $archives->verifierLaDemande($user, $profil, $dossier, ArchiveDuCoffre::MAX_FICHIERS_PREPAREE);

        $cle = [
            'user_id' => $user->id,
            'folder' => $dossier,
            'profile_type' => $profil instanceof Model ? $profil::class : null,
            'profile_id' => $profil instanceof Model ? $profil->getKey() : null,
        ];

        $enCours = $this->deLaCle($cle)->where('status', DocumentVaultArchiveStatus::Pending->value)->first();
        if ($enCours === null) {
            // Une nouvelle demande remplace les préparations terminées du même dossier, fichiers compris.
            $this->deLaCle($cle)->where('status', '!=', DocumentVaultArchiveStatus::Pending->value)->get()
                ->each(function (DocumentVaultArchive $ancienne): void {
                    $ancienne->effacerLeFichier();
                    $ancienne->delete();
                });

            // L'index unique partiel (une préparation en cours par clé) arbitre deux demandes simultanées :
            // la seconde n'insère rien, et ne met donc rien en file.
            $maintenant = now();
            $inseree = DocumentVaultArchive::query()->insertOrIgnore($cle + [
                'uuid' => (string) Str::uuid(),
                'locale' => app()->getLocale(),
                'status' => DocumentVaultArchiveStatus::Pending->value,
                'created_at' => $maintenant,
                'updated_at' => $maintenant,
            ]);
            $enCours = $this->deLaCle($cle)->where('status', DocumentVaultArchiveStatus::Pending->value)->firstOrFail();
            if ($inseree === 1) {
                BatirLArchiveDuCoffreJob::dispatch($enCours->id);
            }
        }

        return $this->json(['data' => (new DocumentVaultArchiveResource($enCours))->toArray($request)], 202);
    }

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $profil = $request->activeProfile();

        $archives = DocumentVaultArchive::query()
            ->where('user_id', $user->id)
            ->when(
                $profil instanceof Model,
                fn (Builder $q) => $q->where('profile_type', $profil::class)->where('profile_id', $profil->getKey()),
                fn (Builder $q) => $q->whereNull('profile_type'),
            )
            ->orderByDesc('id')
            ->get()
            ->reject(fn (DocumentVaultArchive $a): bool => $a->status === DocumentVaultArchiveStatus::Ready && ! $a->estPrete())
            ->unique('folder')
            ->values();

        return $this->json(['data' => DocumentVaultArchiveResource::collection($archives)->toArray($request)]);
    }

    public function download(Request $request, string $archive): StreamedResponse
    {
        abort_code_unless($request->hasValidSignature(false), 403, 'document.archive_link_invalid');

        $trouvee = DocumentVaultArchive::query()->where('uuid', $archive)->first();
        abort_code_if($trouvee === null || (int) $trouvee->user_id !== (int) $request->user()?->id, 403, 'document.archive_link_invalid');
        abort_code_unless(
            $trouvee->estPrete() && Storage::disk((string) $trouvee->disk)->exists((string) $trouvee->path),
            410,
            'document.archive_expired',
        );

        return Storage::disk((string) $trouvee->disk)->download((string) $trouvee->path, 'documents.zip', [
            'Content-Type' => 'application/zip',
            'Cache-Control' => 'private, max-age=0, no-cache',
        ]);
    }

    /**
     * Les préparations d'une clé (compte, dossier, profil).
     *
     * @param  array{user_id: int, folder: string, profile_type: ?string, profile_id: mixed}  $cle
     * @return Builder<DocumentVaultArchive>
     */
    private function deLaCle(array $cle): Builder
    {
        return DocumentVaultArchive::query()
            ->where('user_id', $cle['user_id'])
            ->where('folder', $cle['folder'])
            ->when($cle['profile_type'] === null,
                fn (Builder $q) => $q->whereNull('profile_type')->whereNull('profile_id'),
                fn (Builder $q) => $q->where('profile_type', $cle['profile_type'])->where('profile_id', $cle['profile_id']),
            );
    }
}
