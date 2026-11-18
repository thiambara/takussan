<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Messaging\EvenementsDuFil;
use App\Services\Messaging\FaitsDesMessages;
use App\Services\Messaging\NonLus;
use App\Services\Messaging\ObjetsDesMessages;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class MessageResource extends BaseResource
{
    /**
     * TCK-2736 (décision du porteur du 2026-11-11) — l'échéance des URL signées d'une pièce jointe
     * (photo, PDF, note vocale) et de sa vignette : 5 minutes, comme la présignature de
     * {@see PrivateMediaAccess::redirect()}. `media.private.show` est hors `auth:sanctum`, la
     * signature y tient lieu d'autorisation : un participant retiré lisait un lien déjà reçu pendant
     * les 30 minutes par défaut. La fenêtre est réduite, pas fermée. Le front relit le fil pour une
     * URL neuve (`PieceJointeDuFil.tsx`) : le lien AVANT d'ouvrir s'il est périmé, car un onglet
     * neuf ne remonte pas son 403 ; la note vocale APRÈS son échec, puis elle rejoue.
     */
    public const ATTACHMENT_URL_TTL_MINUTES = 5;

    /**
     * TCK-2858 — la lecture et le rôle de l'auteur, calculés une fois pour la page
     * ({@see FaitsDesMessages}). Absents (recherche transverse) : `null` partout.
     */
    private ?FaitsDesMessages $faits = null;

    public function avecFaits(?FaitsDesMessages $faits): static
    {
        $this->faits = $faits;

        return $this;
    }

    /**
     * TCK-2958 (ADR-0128 § 3) — les objets des cartes et des événements de la page, relus pour le
     * lecteur et chargés en lot ({@see ObjetsDesMessages}). Absents (recherche transverse, message
     * envoyé) : l'objet d'une carte est `{indisponible: true}` — jamais une relecture par message.
     */
    private ?ObjetsDesMessages $objets = null;

    public function avecObjets(?ObjetsDesMessages $objets): static
    {
        $this->objets = $objets;

        return $this;
    }

    /**
     * TCK-2961 — les `event` de la page qui attendent ENCORE le lecteur ({@see NonLus::attendusParmi()} :
     * le dernier qui l'attend, par objet et par fil), calculés une fois pour la page. Absents (message
     * rendu seul) : une requête pour ce message.
     *
     * @var array<int, true>|null
     */
    private ?array $attendus = null;

    /** @param  array<int, true>|null  $attendus */
    public function avecAttendus(?array $attendus): static
    {
        $this->attendus = $attendus;

        return $this;
    }

    /**
     * TCK-2858 — une page de messages d'UN fil, avec les faits de ce fil.
     * TCK-2958 — et les objets de ses cartes et événements, relus pour le lecteur.
     *
     * @param  Collection<int, Message>  $messages
     * @return list<array<string, mixed>>
     */
    public static function page(Collection $messages, FaitsDesMessages $faits, Request $request, ?ObjetsDesMessages $objets = null): array
    {
        // TCK-2961 — une requête pour les événements de la page, jamais une par message.
        $lecteur = $request->user();
        $attendus = $lecteur === null ? [] : NonLus::attendusParmi(
            $messages->filter(fn (Message $m) => $m->type === MessageType::Event && EvenementsDuFil::actionAttenduePar($m, $lecteur))->map(fn (Message $m) => (int) $m->getKey()),
            $lecteur,
        );

        return $messages
            ->map(fn (Message $message) => self::make($message)->avecFaits($faits)->avecObjets($objets)->avecAttendus($attendus)->resolve($request))
            ->values()
            ->all();
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'conversation_id' => $this->conversation_id,
            'sender_id' => $this->sender_id,
            // TCK-2013 (P175.04) — l'auteur, que `ChatView` écrit au-dessus d'un message reçu :
            // son nom montré à un autre compte (`nameWithoutContact()`, jamais une coordonnée).
            // Nul pour un compte effacé, que la portée `SoftDeletes` ne charge pas.
            'sender' => $this->whenLoaded('sender', fn () => $this->resource->sender === null ? null : [
                'id' => $this->resource->sender->id,
                'full_name' => $this->resource->sender->nameWithoutContact(),
                // TCK-2858 — dans un groupe, le rôle de l'auteur au fil : un code, le front écrit le libellé.
                'role_label_code' => $this->faits?->roleDe($this->resource->sender_id !== null ? (int) $this->resource->sender_id : null),
            ]),
            'type' => $this->type?->value,
            'content' => $this->content,
            // TCK-592 — `metadata` (événement d'un avis système, durée d'une note vocale) et
            // `attachments` étaient déclarés par le type front et jamais rendus : un avis système
            // retombait sur sa prose française, et une note vocale n'aurait pas eu de fichier.
            // TCK-2959 (ADR-0128 § 5) — sans `action_for` : la liste des comptes dont un geste est attendu
            // ne sort pas ; le lecteur reçoit son seul booléen, `action_attendue`, pour un `event`.
            'metadata' => EvenementsDuFil::metadataRendu($this->metadata),
            'action_attendue' => $this->when(
                $this->resource->type === MessageType::Event,
                // TCK-2961 — et pas dépassé par un événement postérieur du même objet qui l'attend aussi.
                fn (): bool => EvenementsDuFil::actionAttenduePar($this->resource, $request->user())
                    && isset(($this->attendus ?? NonLus::attendusParmi([(int) $this->resource->getKey()], $request->user()))[(int) $this->resource->getKey()]),
            ),
            // TCK-2958 (ADR-0128 § 3) — l'objet d'une carte ou d'un événement, RELU pour le lecteur : sa
            // projection (avec ses `abilities`) s'il le lit, sinon `{indisponible: true}` sans autre clé.
            'object' => $this->when(
                ObjetsDesMessages::porteUnObjet($this->resource),
                fn (): array => ($this->objets ?? ObjetsDesMessages::aucun())->objetDe($this->resource),
            ),
            'attachments' => $this->attachments(),
            'created_at' => $this->iso($this->created_at),
            // TCK-2858 — « Lu » : direct, la coche d'un message de l'appelant ; groupe, ses lecteurs.
            'read_by_recipient' => $this->faits?->luParLeDestinataire($this->resource),
            'read_count' => $this->faits?->nombreDeLecteurs($this->resource),
        ];
    }

    /**
     * ADR-0038 — URL d'API signées (`PrivateMediaAccess`) : la réponse qui les émet est déjà
     * autorisée (participant actif de la conversation).
     *
     * @return list<array<string, mixed>>
     */
    private function attachments(): array
    {
        $access = app(PrivateMediaAccess::class);
        $expiresAt = now()->addMinutes(self::ATTACHMENT_URL_TTL_MINUTES);

        return $this->resource->getMedia('attachments')
            ->map(fn (Media $media): array => [
                'id' => $media->id,
                'name' => $media->file_name,
                'mime_type' => $media->mime_type,
                'size' => $media->size,
                'url' => $access->signedUrl($media, $expiresAt),
                // TCK-2631 — la vignette d'une photo jointe, signée comme l'original ; `null` pour
                // une note vocale, un PDF, ou tant que la file `media` ne l'a pas produite.
                'thumbnail_url' => $access->signedConversionUrl($media, 'thumbnail', $expiresAt),
            ])
            ->values()
            ->all();
    }
}
