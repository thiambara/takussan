<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Agency;
use App\Models\Document;
use App\Models\PropertyPriceHistory;
use App\Models\Review;
use App\Models\Tag;
use App\Models\User;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Media\WatermarkRequirement;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Property\CoutDEntree;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class PropertyResource extends BaseResource
{
    /** La moyenne des avis approuvés de l'agence, quand l'appelant l'a préchargée (`withAvg`). */
    public const AGENCY_RATING = 'approved_reviews_avg_rating';

    /** @var array{contact: ?User, principal: mixed, source: ?string}|null */
    private ?array $contactResolu = null;

    private ?bool $watermarkRequired = null;

    /**
     * TCK-539 (R2) — toute liste de biens décide du filigrane en UNE requête au plus, sans
     * charger `agency` : un bloc `agency` n'apparaît jamais dans un élément de liste pour cette
     * raison-là (`WatermarkRequirement`). Les quinze listes passent par ici.
     */
    public static function collection($resource)
    {
        WatermarkRequirement::attach($resource);

        return parent::collection($resource);
    }

    public function toArray(Request $request): array
    {
        $isDetail = $request->routeIs('public.properties.show')
            || $request->routeIs('properties.show')
            || $request->routeIs('public.properties.compare');
        // TCK-598 (contraintes 1 et 2, ADR-0052 §1) — sur une route `public.*`, le corps ne
        // dépend PAS de l'appelant. `ResolveActiveProfile` propage un porteur Bearer au garde par
        // défaut sur tout `api/*` (TCK-179) : sans cette règle, le jeton du propriétaire ajoutait
        // les champs de modération, l'e-mail des collaborateurs et l'original signé des photos —
        // et la fiche ne pouvait pas entrer dans un cache partagé.
        $surfacePublique = $request->routeIs('public.*');
        $appelantConnu = $request->user() !== null && ! $surfacePublique;
        // TCK-603 — la liste pro et la réponse de « Changer l'agent responsable » rendent le contact
        // principal à côté de `owner`, seulement si `agency_id` et `user_id` sont chargés : sans eux, la
        // règle jugerait un bien d'agence comme celui d'un particulier.
        $contactRendu = $isDetail || ($request->routeIs('properties.index', 'properties.assigned-agent.update')
            && array_key_exists('agency_id', $this->resource->getAttributes())
            && array_key_exists('user_id', $this->resource->getAttributes()));
        $address = $this->resource->relationLoaded('address') ? $this->resource->address : null;

        return [
            // TCK-336 — `whenHas`, et surtout PAS un accès nu, sur TOUTE clé adossée à une
            // COLONNE. Ces endpoints passent par `Property::buildQuery()`, donc par
            // `fields[properties]=…` de spatie, qui restreint le SELECT — y compris celui
            // d'un `include=property` imbriqué (mesuré : une Booking incluse avec
            // `fields[properties]=id,title,slug,price,currency` rend un modèle à 5 colonnes).
            // Un accès nu sur une colonne non sélectionnée ne rend pas « inconnu » : Eloquent
            // rend `null`, et les casts d'ici transformaient ce `null` en VALEUR MESUREE —
            // `price => 0`, `furnished => false`, `featured => false`, `views_count => 0`,
            // `favorites_count => 0`. Un bien à 0 F CFA, non meublé, jamais consulté : six
            // affirmations sur des colonnes dont la requête n'a rien lu.
            //
            // `whenHas` teste `array_key_exists(...getAttributes())` : une colonne
            // SELECTIONNEE qui vaut `null` reste donc émise à `null` — la distinction porte sur
            // « lue ou pas », jamais sur « nulle ou pas ». Même règle que
            // `UserResource::has_usable_password` (TCK-272) et que
            // `PaymentGatewayService::amountDue()` (ardoise D-51).
            //
            // ⚠ Les clés DÉRIVÉES restent inconditionnelles, et ce n'est pas un oubli :
            // `location`, `main_photo_url`, les cinq `*_label`, `photos`, `tags`,
            // `media_extra`, `average_rating`, `reviews_count`, `price_history`, `documents`
            // et les relations d'`include=` ne sont PAS des colonnes — elles ne peuvent pas
            // figurer dans `fields[properties]` (spatie rend 400 `InvalidFieldQuery`) et donc
            // aucun appelant ne peut les demander. Les gager sur `fields[]` les ferait
            // disparaître chez des appelants qui les affichent. L'arbitrage est posé dans
            // ADR-0021.
            //
            // *Une clé absente se remarque ; une clé fausse se croit.*
            'id' => $this->whenHas('id'),
            'reference_number' => $this->whenHas('reference_number'),
            'title' => $this->whenHas('title'),
            'slug' => $this->whenHas('slug'),
            'price' => $this->whenHas('price', fn ($valeur) => (float) $valeur),
            'currency' => $this->whenHas('currency', fn ($valeur) => $valeur?->value),
            'type' => $this->whenHas('type', fn ($valeur) => $valeur?->value),
            'type_label' => $this->enumLabel($this->type, 'properties.type'),
            'contract_type' => $this->whenHas('contract_type', fn ($valeur) => $valeur?->value),
            'contract_type_label' => $this->enumLabel($this->contract_type, 'properties.contract_type'),
            'rent_period' => $this->whenHas('rent_period', fn ($valeur) => $valeur?->value),
            'rent_period_label' => $this->enumLabel($this->rent_period, 'properties.rent_period'),
            'status' => $this->whenHas('status', fn ($valeur) => $valeur?->value),
            'status_label' => $this->enumLabel($this->status, 'properties.status'),
            'visibility' => $this->whenHas('visibility', fn ($valeur) => $valeur?->value),
            'title_type' => $this->whenHas('title_type', fn ($valeur) => $valeur?->value),
            'title_type_label' => $this->enumLabel($this->title_type, 'properties.title_type'),
            'condition' => $this->whenHas('condition', fn ($valeur) => $valeur?->value),
            'condition_label' => $this->enumLabel($this->condition, 'properties.condition'),
            'location' => $this->buildLocation($address),
            'bedrooms' => $this->whenHas('bedrooms'),
            'bathrooms' => $this->whenHas('bathrooms'),
            'area' => $this->whenHas('area'),
            'floor_number' => $this->whenHas('floor_number'),
            'total_floors' => $this->whenHas('total_floors'),
            'year_built' => $this->whenHas('year_built'),
            'parking_spaces' => $this->whenHas('parking_spaces'),
            'available_from' => $this->whenHas('available_from', fn ($valeur) => $this->calendarDate($valeur)),
            'furnished' => $this->whenHas('furnished', fn ($valeur) => (bool) $valeur),
            'featured' => $this->whenHas('featured', fn ($valeur) => (bool) $valeur),
            // ⚠ `views_count` / `favorites_count` restent dans la FORME LISTE, et c'est mesuré :
            // `DASHBOARD_PROPERTY_FIELDS` (`takussan-web/src/lib/queries/properties-server.ts`)
            // les demande explicitement, et `PropertyList.tsx` les rend dans chaque ligne du
            // tableau de bord agent (lignes 267/272 en carte, 405/409 en tableau). Les passer
            // derrière `$isDetail` viderait cette colonne sans erreur TypeScript ni test rouge.
            'views_count' => $this->whenHas('views_count', fn ($valeur) => (int) ($valeur ?? 0)),
            'favorites_count' => $this->whenHas('favorites_count', fn ($valeur) => (int) ($valeur ?? 0)),
            'average_rating' => $this->when($isDetail, fn () => $this->computeAverageRating()),
            'reviews_count' => $this->when($isDetail, fn () => $this->computeReviewsCount()),
            'main_photo_url' => ($m = $this->getFirstMedia('photos')) ? $this->urlFor($m, 'preview') : null,
            'description' => $this->when($isDetail, fn () => $this->whenHas('description')),
            'photos' => $this->when(
                $isDetail,
                // TCK-539 — une photo sans AUCUNE conversion produite n'a rien à montrer : elle
                // sort de la liste plutôt que d'y entrer avec `full: null`. La galerie publique
                // passe `photo.full` tel quel à `next/image` (`PropertyGalleryMosaic`,
                // `PropertyMobileGallery`), qui refuse un `src` nul. Elle y revient dès que
                // `thumbnail` existe ET, si le bien l'exige, est filigranée (D3) — donc au
                // passage de `worker-media`.
                //
                // `setRelation('model')` : `viewRaw` lit `$media->model`, on le lui donne plutôt
                // qu'une requête par photo.
                fn () => $this->getMedia('photos')->values()
                    ->each(fn (Media $media) => $media->setRelation('model', $this->resource))
                    ->map(fn (Media $media, int $index) => [
                        'id' => $media->id,
                        'thumbnail' => $this->urlFor($media, 'thumbnail'),
                        'preview' => $this->urlFor($media, 'preview'),
                        'full' => $this->urlFor($media, 'full'),
                        'original' => $this->originalUrlFor($media),
                        'order' => $media->order_column ?? ($index + 1),
                    ])->filter(fn (array $photo) => $photo['full'] !== null)->values()->all()
            ),
            // TCK-598 (V19) — la visite virtuelle a sa colonne, et sort au premier niveau.
            // `media_extra.virtual_tour_url` la REPREND pour la compatibilité : il lisait
            // `metadata.virtual_tour_url`, qu'aucune route n'écrivait. Il disparaît une fois le
            // front migré (« Pour la session » du ticket).
            'virtual_tour_url' => $this->when($isDetail, fn () => $this->whenHas('virtual_tour_url')),
            'media_extra' => $this->when($isDetail, fn () => [
                'videos' => $this->getMedia('videos')->map(fn (Media $m) => $m->getUrl())->values()->all(),
                'plans' => $this->getMedia('plans')->map(fn (Media $m) => $m->getUrl())->values()->all(),
                'virtual_tour_url' => $this->resource->getAttribute('virtual_tour_url'),
            ]),
            // TCK-598 (V9) — ce qu'il faut verser pour emménager, d'une location mensuelle
            // seulement ; `null` sinon, et `null` si rien n'est renseigné. Le calcul :
            // `CoutDEntree`.
            'entry_cost' => $this->when($isDetail, fn () => CoutDEntree::pour($this->resource)),
            'tags' => $this->when($isDetail, fn () => $this->resource->tags->map(fn (Tag $tag) => [
                'id' => $tag->id,
                'name' => $tag->name,
                'slug' => $tag->slug,
                'type' => $tag->type?->value,
                'icon' => $tag->icon,
                'color' => $tag->color,
            ])->values()->all()),
            'owner' => $this->when(
                $isDetail || $this->resource->relationLoaded('owner'),
                fn () => $this->buildOwner()
            ),
            // TCK-502 — **qui répond pour ce bien**, et non qui le possède. La carte de contact
            // de la fiche lisait `owner` et le message partait au collaborateur `agent` : l'écran
            // nommait Pape Cissé, le fil naissait chez Ousmane Ndiaye.
            //
            // ⚠ `owner` est CONSERVÉ tel quel, avec son sens de toujours — il porte la propriété,
            // et six surfaces le lisent pour ça (duplication, tableau de bord, politiques).
            // Redéfinir une clé existante aurait corrigé la fiche en cassant tout le reste en
            // silence. La clé neuve, elle, ne ment nulle part : là où elle manque, elle manque.
            //
            // TCK-603 (ADR-0036) — la liste pro et la réponse de « Changer l'agent responsable »
            // le rendent aussi, à côté de `owner` : l'écran distingue le propriétaire de l'agent
            // responsable. Seulement si `agency_id` et `user_id` sont chargés — sans eux, la règle
            // jugerait un bien d'agence comme celui d'un particulier.
            'primary_contact' => $this->when($contactRendu, fn () => $this->buildPrimaryContact()),
            // TCK-603 (ADR-0059 §6, verif-603 M2) — d'où vient ce contact : `designated`,
            // `invitation_order`, `owner` ou `null`. L'écran distingue l'agent responsable du
            // propriétaire par ce champ, jamais par `owner.id === primary_contact.id` — un agent qui a
            // saisi le bien et en est responsable a les deux. Jamais sur `public.*` : c'est une donnée
            // d'organisation de l'agence.
            'primary_contact_source' => $this->when(
                $contactRendu && ! $surfacePublique,
                fn () => $this->contactResolu()['source']
            ),
            // TCK-598 (B1) — JAMAIS sur une route `public.*`, quel que soit l'appelant : la part de
            // commission et le rôle d'un collaborateur sont des données d'agence. `show()` et
            // `compare()` chargent pourtant la relation, parce que `PrimaryPropertyContact` en a
            // besoin : c'est la sérialisation qui se conditionne, pas le chargement (le retirer
            // ferait un N+1 sans rien fermer). Qui peut la lire ailleurs relève de TCK-587.
            'collaborators' => $this->when(
                ! $surfacePublique && $this->resource->relationLoaded('collaborators'),
                fn () => $this->resource->collaborators->map(fn ($collaborator) => [
                    'id' => $collaborator->id,
                    'user_id' => $collaborator->user_id,
                    'role' => $collaborator->role?->value,
                    // TCK-504 — la marque d'agent principal (ADR-0053), telle qu'en base.
                    'is_primary' => (bool) $collaborator->is_primary,
                    'commission_share' => $collaborator->commission_share !== null
                        ? (float) $collaborator->commission_share
                        : null,
                    'user' => $collaborator->relationLoaded('user') && $collaborator->user
                        ? [
                            'id' => $collaborator->user->id,
                            'name' => trim($collaborator->user->first_name.' '.$collaborator->user->last_name)
                                ?: $collaborator->user->username,
                            // Collaborator email is private team data — only surface it to
                            // authenticated viewers (agent dashboard), never on the public
                            // property page which eager-loads `collaborators.user`.
                            'email' => $appelantConnu ? $collaborator->user->email : null,
                        ]
                        : null,
                ])->values()->all()
            ),
            'agency' => $this->when(
                $isDetail || $this->resource->relationLoaded('agency'),
                fn () => $this->buildAgency()
            ),
            'documents' => $this->when($isDetail, fn () => $this->buildDocuments()),
            'price_history' => $this->when($isDetail, fn () => $this->buildPriceHistory()),
            'published_at' => $this->whenHas('published_at', fn ($valeur) => $this->iso($valeur)),
            'created_at' => $this->whenHas('created_at', fn ($valeur) => $this->iso($valeur)),
            // TCK-098 — moderation fields, so the agent dashboard can render the
            // status banner without a second round-trip. TCK-335 — that dashboard
            // is rendered from an AUTHENTICATED session, so gating them on
            // `$request->user()` costs it nothing; the same key already masks a
            // collaborator's email above. Anonymous callers were carrying 4 keys
            // that are null by construction on any public property
            // (`PropertyModerationService::approve()` clears `rejection_reason`
            // and `rejected_at`; `rejected`/`pending_review` are in
            // `NON_PUBLIC_STATUSES`) — 8.5% of the search payload, and a needless
            // disclosure of the moderation machinery. Absent, not null: a missing
            // key gets noticed, a null one gets believed.
            //
            // TCK-598 — `$appelantConnu` et non plus `$request->user() !== null` : sur une route
            // `public.*`, ils ne sortent pour personne. Le tableau de bord les lit sur
            // `properties.show`, authentifiée.
            'rejection_reason' => $this->when(
                $appelantConnu,
                fn () => $this->whenHas('rejection_reason'),
            ),
            'submitted_at' => $this->when(
                $appelantConnu,
                fn () => $this->whenHas('submitted_at', fn ($valeur) => $this->iso($valeur)),
            ),
            'approved_at' => $this->when(
                $appelantConnu,
                fn () => $this->whenHas('approved_at', fn ($valeur) => $this->iso($valeur)),
            ),
            'rejected_at' => $this->when(
                $appelantConnu,
                fn () => $this->whenHas('rejected_at', fn ($valeur) => $this->iso($valeur)),
            ),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildLocation(mixed $address): array
    {
        $quarter = $address?->neighborhood;
        $city = $address?->city;
        $region = $address?->region;
        $country = $address?->country;
        $parts = array_filter([$quarter, $city, $region, $country], fn ($v) => $v !== null && $v !== '');

        return [
            'full' => $parts === [] ? null : implode(', ', $parts),
            'quarter' => $quarter,
            'city' => $city,
            'region' => $region,
            'country' => $country,
            'latitude' => $address?->latitude !== null ? (float) $address->latitude : null,
            'longitude' => $address?->longitude !== null ? (float) $address->longitude : null,
        ];
    }

    private function computeAverageRating(): ?float
    {
        if ($this->resource->relationLoaded('reviews')) {
            $reviews = $this->resource->reviews;
            if ($reviews->isEmpty()) {
                return null;
            }

            return round((float) $reviews->avg('rating'), 2);
        }

        $avg = $this->resource->reviews()->where('is_approved', true)->avg('rating');

        return $avg !== null ? round((float) $avg, 2) : null;
    }

    private function computeReviewsCount(): int
    {
        if ($this->resource->relationLoaded('reviews')) {
            return $this->resource->reviews->count();
        }

        return (int) $this->resource->reviews()->where('is_approved', true)->count();
    }

    /**
     * TCK-142 — `is_agent` used to derive from a now-dropped column. "Agent"
     * here means the user holds a professional profile that can list
     * properties on behalf of the property's agency: an AgentProfile in that
     * agency. Un profil hors de toute agence ne suffit pas — c'est ce qui
     * présentait le courtier en agent sur n'importe quelle fiche (ADR-0030).
     *
     * TCK-502 — la méthode ne prend plus « le propriétaire » mais « un utilisateur » : le contact
     * principal peut être un collaborateur, et la question posée est la même pour lui.
     */
    private function actsAsAgent(User $user): bool
    {
        $agency = $this->resource->agency;

        // TCK-603 (verif-603 m4) — sur la liste, l'amorce de la page a déjà jugé le couple.
        return $agency !== null
            && (MembershipCapabilityResolver::amorce('agent', (int) $user->id, (int) $agency->id) ?? $user->isAgentAt($agency->id));
    }

    /**
     * @return array<string, mixed>|null
     */
    private function buildOwner(): ?array
    {
        /** @var User|null $owner */
        $owner = $this->resource->owner;

        return $owner === null ? null : $this->buildUserLite($owner);
    }

    /**
     * TCK-502 — la personne que la carte de contact doit nommer, parce que c'est elle qui
     * recevra le message. Même forme que `owner`, pour que la carte n'ait qu'un repli à écrire.
     *
     * @return array<string, mixed>|null
     */
    /**
     * La règle du contact, jugée une fois par ressource : `primary_contact` et
     * `primary_contact_source` la lisent tous deux.
     *
     * @return array{contact: ?User, principal: mixed, source: ?string}
     */
    private function contactResolu(): array
    {
        return $this->contactResolu ??= PrimaryPropertyContact::resolve($this->resource);
    }

    private function buildPrimaryContact(): ?array
    {
        $contact = $this->contactResolu()['contact'];

        // TCK-590 — la fiche sait si le contact a un numéro, sans le révéler : sans numéro, ni
        // WhatsApp ni Appeler (qui menaient à une erreur). Le numéro lui-même ne sort qu'au geste
        // (`GET …/contact`, sous limiteur), jamais ici — contrainte 7.
        return $contact === null ? null : $this->buildUserLite($contact) + [
            'has_phone' => is_string($contact->phone) && $contact->phone !== '',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildUserLite(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => trim($user->first_name.' '.$user->last_name) ?: $user->username,
            // TCK-177 — used to link the contact card to /agents/[slug].
            'slug' => $user->username,
            'avatar_url' => $user->getFirstMediaUrl('avatar') ?: null,
            'is_agent' => $this->actsAsAgent($user),
            'member_since' => $this->iso($user->created_at),
            // TCK-598 (V8, contrainte 9) — un BOOLÉEN dérivé, jamais la date ni le numéro. Il ne
            // dépend pas de l'appelant (contrainte 2). Aucun « identité vérifiée » de personne :
            // le modèle n'en porte pas (le KYC est celui de l'agence, `agency.verified`).
            'phone_verified' => $user->phone_verified_at !== null,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function buildAgency(): ?array
    {
        /** @var Agency|null $agency */
        $agency = $this->resource->agency;
        if ($agency === null) {
            return null;
        }

        // TCK-603 (verif-603 m4) — la liste précharge la moyenne (`PropertyController::index`).
        $agencyRating = array_key_exists(self::AGENCY_RATING, $agency->getAttributes())
            ? $agency->getAttribute(self::AGENCY_RATING)
            : Review::query()
                ->where('reviewable_type', Agency::class)
                ->where('reviewable_id', $agency->id)
                ->where('is_approved', true)
                ->avg('rating');

        return [
            'id' => $agency->id,
            'name' => $agency->name,
            'slug' => $agency->slug,
            'logo_url' => $agency->getFirstMediaUrl('logo') ?: null,
            'verified' => (bool) $agency->is_verified,
            'rating' => $agencyRating !== null ? round((float) $agencyRating, 2) : null,
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildDocuments(): array
    {
        $documents = $this->resource->relationLoaded('documents')
            ? $this->resource->documents
            : $this->resource->documents()->get();

        return $documents
            ->filter(fn (Document $doc) => (bool) data_get($doc->metadata, 'public', false))
            ->values()
            ->map(function (Document $doc) {
                $media = $doc->getFirstMedia('file');

                return [
                    'id' => $doc->id,
                    'name' => $doc->name,
                    'type' => $doc->type?->value,
                    'size' => $media?->size,
                    // TCK-545 — URL STABLE, autorisée par l'état : `Document.file` est privée
                    // (TCK-538), `getUrl()` n'y est servie par personne. Voir
                    // `PublicPropertyDocumentController`.
                    'url' => $media === null ? null : route('public.properties.documents.file', [
                        'property' => $this->resource->getKey(),
                        'document' => $doc->getKey(),
                    ]),
                    'public' => true,
                ];
            })->all();
    }

    /**
     * TCK-539 — la conversion demandée si elle est produite, sinon la plus grande plus petite,
     * sinon `null` : `PublicPhotoUrl`. `preview` et `full` sont en file, et `getUrl()` rendait
     * une URL en 404 entre l'upload et le passage de `worker-media`.
     */
    private function urlFor(Media $media, string $conversion): ?string
    {
        if (request()->boolean('raw') && ! request()->routeIs('public.*') && Gate::allows('viewRaw', $media)) {
            return app(PrivateMediaAccess::class)->signedUrl($media);
        }

        return PublicPhotoUrl::upTo($media, $conversion, fn () => $this->watermarkRequired());
    }

    /**
     * TCK-106 — `original` exposes the unwatermarked source file.
     * Only return it when the caller is authorized to view raw media,
     * otherwise fall back to the largest watermarked conversion
     * so public consumers cannot bypass the watermark.
     *
     * TCK-356 — cette plus grande conversion est `full` (1600 px) ; TCK-539 — avec repli
     * sur `preview` puis `thumbnail` tant qu'elle n'est pas produite, jamais sur l'original.
     */
    private function originalUrlFor(Media $media): ?string
    {
        // TCK-598 (contrainte 2) — jamais sur une route `public.*` : le propriétaire y reçoit la
        // même conversion filigranée que n'importe qui, sinon la fiche dépend de l'appelant.
        if (! request()->routeIs('public.*') && Gate::allows('viewRaw', $media)) {
            // TCK-539 (D2) — l'original est sur le disque PRIVÉ : `getUrl()` n'y est servie par
            // personne. Il sort par l'URL d'API signée, émise ici après la décision `viewRaw`.
            return app(PrivateMediaAccess::class)->signedUrl($media);
        }

        return PublicPhotoUrl::upTo($media, 'full', fn () => $this->watermarkRequired());
    }

    /**
     * `Property::requiresWatermark()`, lu une fois par bien et non une fois par photo — et
     * seulement si une conversion produite n'est pas encore filigranée (`PublicPhotoUrl`).
     * Sans charger `agency` : dans une liste, le lot rattaché par `collection()` (une requête).
     */
    private function watermarkRequired(): bool
    {
        return $this->watermarkRequired ??= $this->resource->requiresWatermark();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildPriceHistory(): array
    {
        $history = $this->resource->relationLoaded('priceHistory')
            ? $this->resource->priceHistory
            : $this->resource->priceHistory()->get();

        return $history->map(fn (PropertyPriceHistory $entry) => [
            'id' => $entry->id,
            'old_price' => $entry->old_price !== null ? (float) $entry->old_price : null,
            'new_price' => $entry->new_price !== null ? (float) $entry->new_price : null,
            'currency' => $entry->currency?->value,
            'reason' => $entry->reason?->value,
            'changed_at' => $this->iso($entry->changed_at),
        ])->values()->all();
    }
}
