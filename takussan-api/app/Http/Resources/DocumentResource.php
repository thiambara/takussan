<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Document;
use App\Services\Document\DocumentVersionService;
use App\Services\Documents\AuteurDuDocument;
use App\Services\Documents\DocumentVisibility;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Support\Http\ParametreUnique;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\Request;

class DocumentResource extends BaseResource
{
    /**
     * TCK-2773 (ADR-0099, amendement du 2026-11-13, § 5) — les auteurs nommés selon le lecteur
     * (`uploaded_by_person`, `verified_by_person`, `versions[].uploaded_by_person`) : sur un document
     * seul, jamais sur une liste.
     */
    private bool $avecAuteurs = false;

    /** TCK-2773 — la fiche d'un document : ses auteurs, jugés par {@see AuteurDuDocument}. */
    public function avecAuteurs(): static
    {
        $this->avecAuteurs = true;

        return $this;
    }

    /**
     * P189.01 (TCK-1867) — une page de documents, avec ses `abilities` : le porteur est chargé une
     * fois pour la page, et les profils de l'appelant dans les agences des porteurs jugés une fois
     * ({@see MembershipCapabilityResolver::primed()}), sans quoi `DocumentPolicy` relirait le porteur
     * et le statut du bailleur à chaque ligne.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function page(LengthAwarePaginator $paginator, Request $request): array
    {
        $documents = $paginator->getCollection();
        if ($request->user() === null || $documents->isEmpty()) {
            return self::collection($paginator)->toArray($request);
        }

        // Vérification de 416274da0 (r1, r2) — `abilities` se juge sur la ligne entière, quels que soient
        // les `fields[documents]` : le porteur (ses deux clés), l'auteur et le drapeau interne.
        DocumentVisibility::completerLesColonnes($documents, ['documentable_type', 'documentable_id', ...DocumentVisibility::COLONNES_DU_JUGEMENT]);
        $documents->loadMissing('documentable');

        return MembershipCapabilityResolver::primed(
            [$request->user()->id],
            $documents->map(fn (Document $document) => $document->documentable instanceof Agency
                ? $document->documentable->id
                : ($document->documentable?->agency_id ?? null)),
            fn () => self::collection($paginator)->toArray($request),
        );
    }

    public function toArray(Request $request): array
    {
        /** @var Document $this */
        // TCK-2300 (P231.02) — la version active, sinon `file`.
        $file = $this->currentFile();

        // Version active de la collection `versions`. P20.05 (TCK-901) — sur la relation `media`
        // quand la liste l'a chargée ; sinon `activeVersion()`, qui interroge la table.
        $activeVersion = $this->relationLoaded('media')
            ? $this->getMedia(DocumentVersionService::COLLECTION)
                ->first(fn ($m) => (bool) $m->getCustomProperty('is_active', false))
            : $this->activeVersion();

        // P216.03 (TCK-2124) — `include[]=…` vaut un `include` absent (TCK-1407, TCK-1866), et n'est plus casté.
        $include = ParametreUnique::chaine($request, 'include') ?? '';
        $includes = array_filter(array_map('trim', explode(',', $include)));
        $includeVersions = in_array('versions', $includes, true);

        // TCK-2773 — un juge pour la fiche : chaque auteur n'y est jugé qu'une fois.
        $juge = $this->avecAuteurs ? AuteurDuDocument::pour($this->resource, $request->user()) : null;

        return [
            'id' => $this->id,
            'documentable_id' => $this->documentable_id,
            'documentable_type' => $this->documentable_type,
            'uploaded_by' => $this->uploaded_by,
            // TCK-2773 — le nom, un rôle ou rien, selon le lecteur ; absent d'une liste.
            'uploaded_by_person' => $this->when($juge !== null, fn () => $juge->de($this->uploaded_by)),
            'name' => $this->name,
            'type' => $this->type?->value,
            'description' => $this->description,
            'is_verified' => (bool) $this->is_verified,
            // TCK-2759 — gardé pour l'agence : le sujet de la fiche ne le lit pas (seul le personnel le reçoit).
            'is_internal' => (bool) $this->is_internal,
            'verified_by' => $this->verified_by,
            // TCK-2773 — un opérateur de la plateforme : `platform` hors de la console.
            'verified_by_person' => $this->when($juge !== null, fn () => $juge->de($this->verified_by)),
            'verified_at' => $this->iso($this->verified_at),
            'expiry_date' => $this->calendarDate($this->expiry_date),
            // Le fichier qui fait foi (TCK-2300). TCK-539 — URL d'API signée, plus l'URL du fichier :
            // elle expire (30 min), elle ne se garde pas.
            'file_url' => $file ? app(PrivateMediaAccess::class)->signedUrl($file) : null,
            'file_name' => $file?->file_name,
            'file_size' => $file?->size,
            'mime_type' => $file?->mime_type,
            // Active version from the `versions` collection (null if no version uploaded yet).
            'active_version' => $activeVersion
                ? DocumentVersionResource::make($activeVersion)->avecJuge($juge)->toArray($request)
                : null,
            // Versions list — only included when explicitly requested via include=versions.
            'versions' => $includeVersions
                ? $this->getMedia(DocumentVersionService::COLLECTION)
                    ->sortByDesc(fn ($m) => $m->getCustomProperty('version_number', 0))
                    ->values()
                    // TCK-2773 — chaque version avec le juge de la fiche (aucun sur une liste).
                    ->map(fn ($m) => DocumentVersionResource::make($m)->avecJuge($juge)->toArray($request))
                    ->all()
                : null,
            'created_at' => $this->iso($this->created_at),
            // P189.01 (TCK-1867) — les gestes que `DocumentPolicy` accorde à l'appelant : la fiche et
            // la bibliothèque n'ouvrent plus « Nouvelle version », « Restaurer », « Partager » et
            // « Supprimer » par la seule identité du téléverseur (le bailleur suspendu les perd, TCK-587).
            'abilities' => $this->when($request->user() !== null, fn (): array => [
                'update' => $request->user()->can('update', $this->resource),
                'share' => $partage = $request->user()->can('share', $this->resource),
                'delete' => $request->user()->can('delete', $this->resource),
                // TCK-2729 5a — le bailleur bloqué voit et révoque les liens qu'il a créés
                // (`DocumentPolicy::manageOwnShareLinks`) : sur la fiche seule, et jugé seulement quand
                // `share` est refusé — aucune requête de plus sur une liste ni pour qui partage.
                'manage_own_share_links' => $this->avecAuteurs && ! $partage
                    && $request->user()->can('manageOwnShareLinks', $this->resource),
                // TCK-2759 — « Garder pour l'agence » / « Rendre visible au client » : sur une fiche
                // client seulement (ailleurs, la bascule rend 422 et ne s'offre pas). Ni sur une pièce
                // visible du sujet : la seule bascule y serait refusée (TCK-2759 r1, DocumentVisibility::basculeOfferte).
                'set_visibility' => $this->documentable_type === Customer::class
                    && $request->user()->can('setVisibility', $this->resource)
                    && $this->documentable instanceof Customer
                    && DocumentVisibility::basculeOfferte($this->resource, $this->documentable),
            ]),
        ];
    }
}
