<?php

namespace App\Services\Booking;

use App\Domain\Notifications\NotificationCode;
use App\Models\Booking;
use App\Models\BookingDossierItem;
use App\Models\Document;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\DossierPiece;
use App\Models\User;
use App\Services\Model\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2872 (ADR-0110 § 2) — le dossier d'une candidature ou d'une offre, écrit en un seul endroit.
 *
 * - **La liste est fixe par nature**, posée à la création ({@see self::seed()}, appelé par
 *   `Booking::performInsert` : tous les chemins de création) ; un séjour n'en a pas. TCK-2893 y
 *   ajoute ou en retire les pièces du garant ({@see self::addPieces()}, {@see self::removePieces()}) :
 *   une pièce reçue n'est jamais retirée.
 * - **Une pièce reçue est un `Document` VIVANT** dont le porteur est la réservation : un document
 *   supprimé (en douceur) ne compte plus, la pièce redevient manquante. Elle se lit selon
 *   `DocumentPolicy` (ADR-0099), jamais par un autre candidat.
 * - **La complétude est dérivée** (`received` / `required` / `missing`), en UNE requête pour la page
 *   ({@see self::prime()}), servie par `BookingResource::dossier`.
 * - **« Demander »** : au plus une fois par pièce et par 24 h (429), jamais pour une pièce reçue
 *   (422) ; le client est prévenu par `booking.dossier_piece_requested` (ADR-0032).
 * - **Une réservation fermée** (refusée, annulée, expirée, terminée) garde son dossier lisible et
 *   n'accepte plus ni dépôt ni demande (422 `booking.dossier_closed`).
 */
final class BookingDossierService
{
    /** L'attribut de requête où {@see self::prime()} range la complétude de la page. */
    private const RESUMES = 'bookings.dossier';

    /** Les statuts où le dossier s'écrit encore. */
    private const OUVERTS = [BookingStatus::Pending, BookingStatus::Confirmed];

    /** La borne de « Demander » : une fois par pièce et par 24 h. */
    public const REQUEST_COOLDOWN_HOURS = 24;

    /** Pose la liste fixe de la nature ; rejouable (une pièce déjà posée reste telle quelle). */
    public function seed(Booking $booking): void
    {
        $kind = $booking->kind instanceof BookingKind ? $booking->kind : BookingKind::tryFrom((string) $booking->kind);
        if ($kind === null) {
            return;
        }

        $this->insertPieces($booking, DossierPiece::forKind($kind));
    }

    /**
     * TCK-2893 — ajoute des pièces attendues (le garant déclaré) ; une pièce déjà posée redevient
     * attendue. Sans effet sur un séjour, qui n'a pas de dossier.
     *
     * @param  list<DossierPiece>  $pieces
     */
    public function addPieces(Booking $booking, array $pieces): void
    {
        if ($this->kindOf($booking) === BookingKind::Stay || $pieces === []) {
            return;
        }

        $this->insertPieces($booking, $pieces);
        BookingDossierItem::query()
            ->where('booking_id', $booking->id)
            ->whereIn('piece', array_map(fn (DossierPiece $p): string => $p->value, $pieces))
            ->where('required', false)
            ->update(['required' => true, 'updated_at' => now()]);
    }

    /**
     * TCK-2893 — retire des pièces (le garant retiré) ; une pièce REÇUE n'est jamais retirée.
     *
     * @param  list<DossierPiece>  $pieces
     */
    public function removePieces(Booking $booking, array $pieces): void
    {
        if ($pieces === []) {
            return;
        }

        BookingDossierItem::query()
            ->where('booking_id', $booking->id)
            ->whereIn('piece', array_map(fn (DossierPiece $p): string => $p->value, $pieces))
            // « Reçue » = un document VIVANT, comme partout ici : une pièce dont le document a été
            // supprimé (en douceur) est manquante, donc retirable.
            ->whereNotExists(fn ($q) => $q->selectRaw('1')->from('documents')
                ->whereColumn('documents.id', 'booking_dossier_items.document_id')
                ->whereNull('documents.deleted_at'))
            ->delete();
    }

    /**
     * Les pièces de la réservation, dans l'ordre de l'enum, chacune avec son document vivant.
     *
     * @return Collection<int, BookingDossierItem>
     */
    public function items(Booking $booking): Collection
    {
        $ordre = array_flip(array_map(fn (DossierPiece $p): string => $p->value, DossierPiece::cases()));

        return $booking->dossierItems()
            ->with('document:id,name,type,created_at')
            ->get()
            ->sortBy(fn (BookingDossierItem $item): int => $ordre[$item->piece->value] ?? PHP_INT_MAX)
            ->values();
    }

    /** La pièce de cette réservation, ou 404 : une pièce hors de sa liste n'existe pas pour elle. */
    public function item(Booking $booking, DossierPiece $piece): BookingDossierItem
    {
        $item = $booking->dossierItems()->where('piece', $piece->value)->first();
        abort_code_if($item === null, 404, 'booking.dossier_piece_not_found');

        return $item;
    }

    /**
     * Le dépôt d'une pièce (le client, ou le personnel de l'agence du bien — `BookingPolicy::
     * uploadDossierPiece`) : un `Document` dont le porteur est la réservation. Une pièce déjà reçue
     * est remplacée ; le document précédent reste au coffre de la réservation.
     */
    public function upload(Booking $booking, DossierPiece $piece, UploadedFile $file, User $user): BookingDossierItem
    {
        $this->assertOpen($booking);
        $item = $this->item($booking, $piece);

        $nom = trim((string) $file->getClientOriginalName());
        $document = Document::create([
            'documentable_id' => $booking->getKey(),
            'documentable_type' => Booking::class,
            'uploaded_by' => $user->id,
            'is_internal' => false,
            'name' => mb_substr($nom !== '' ? $nom : $piece->value, 0, 255),
            'type' => $piece->documentType()->value,
            'is_verified' => false,
        ]);
        $document->addMedia($file)->toMediaCollection('file');

        $item->forceFill(['document_id' => $document->id, 'received_at' => now()])->save();

        return $item->setRelation('document', $document);
    }

    /**
     * « Demander » une pièce manquante (le personnel de l'agence du bien — `BookingPolicy::
     * requestDossierPiece`). Jugé sous le verrou de la ligne : deux clics simultanés n'envoient
     * qu'un avis. Le client sans compte n'est pas prévenu (la demande est datée quand même).
     *
     * @return array{0: BookingDossierItem, 1: bool} la pièce, et si le client a été prévenu
     */
    public function request(Booking $booking, DossierPiece $piece, User $user): array
    {
        $this->assertOpen($booking);
        $this->item($booking, $piece);

        $item = DB::transaction(function () use ($booking, $piece, $user): BookingDossierItem {
            /** @var BookingDossierItem $item */
            $item = BookingDossierItem::query()
                ->where('booking_id', $booking->id)
                ->where('piece', $piece->value)
                ->lockForUpdate()
                ->firstOrFail();

            abort_code_if($this->isReceived($item), 422, 'booking.dossier_piece_received');
            abort_code_if(
                $item->requested_at !== null && $item->requested_at->gt(now()->subHours(self::REQUEST_COOLDOWN_HOURS)),
                429,
                'booking.dossier_request_throttled',
            );

            $item->forceFill(['requested_at' => now(), 'requested_by_id' => $user->id])->save();

            return $item;
        });

        $client = $booking->customer?->user;
        if ($client !== null) {
            app(NotificationService::class)->send(
                $client,
                NotificationCode::BookingDossierPieceRequested,
                BookingNotificationParams::for($booking, NotificationCode::BookingDossierPieceRequested) + ['piece' => $piece->value],
                BookingNotificationParams::target($booking),
            );
        }

        return [$item->load('document:id,name,type,created_at'), $client !== null];
    }

    /** Reçue : un document VIVANT y est rattaché (un document supprimé en douceur ne compte plus). */
    public function isReceived(BookingDossierItem $item): bool
    {
        return $item->document_id !== null
            && Document::query()->whereKey($item->document_id)->exists();
    }

    /**
     * La complétude de chaque réservation de la page, en UNE requête : `{ received, required,
     * missing }`, ou `null` pour une réservation sans dossier (un séjour). Lue par les ids, jamais
     * par les attributs du modèle (un sparse fieldset peut avoir omis `kind`).
     *
     * @param  iterable<Booking>  $bookings
     */
    public function prime(Request $request, iterable $bookings): void
    {
        $ids = [];
        foreach ($bookings as $booking) {
            $ids[] = (int) $booking->id;
        }
        if ($ids === []) {
            return;
        }

        $request->attributes->set(
            self::RESUMES,
            $this->summaries($ids) + ($request->attributes->get(self::RESUMES) ?? []),
        );
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, array{received: int, required: int, missing: list<string>}|null>
     */
    public function summaries(array $ids): array
    {
        $lignes = DB::table('booking_dossier_items as i')
            ->leftJoin('documents as d', fn ($j) => $j->on('d.id', '=', 'i.document_id')->whereNull('d.deleted_at'))
            ->whereIn('i.booking_id', $ids)
            ->where('i.required', true)
            ->get(['i.booking_id', 'i.piece', DB::raw('d.id is not null as recue')]);

        $ordre = array_flip(array_map(fn (DossierPiece $p): string => $p->value, DossierPiece::cases()));
        $resumes = array_fill_keys($ids, null);
        foreach ($lignes->groupBy('booking_id') as $bookingId => $pieces) {
            $manquantes = $pieces->filter(fn ($l): bool => ! $l->recue)->pluck('piece')
                ->sortBy(fn (string $p): int => $ordre[$p] ?? PHP_INT_MAX)->values()->all();
            $resumes[(int) $bookingId] = [
                'received' => $pieces->filter(fn ($l): bool => (bool) $l->recue)->count(),
                'required' => $pieces->count(),
                'missing' => $manquantes,
            ];
        }

        return $resumes;
    }

    /**
     * @return array{0: bool, 1: array{received: int, required: int, missing: list<string>}|null} servi ?, valeur
     */
    public static function summaryFor(Request $request, Booking $booking): array
    {
        $resumes = $request->attributes->get(self::RESUMES);
        if (! is_array($resumes) || ! array_key_exists((int) $booking->id, $resumes)) {
            return [false, null];
        }

        return [true, $resumes[(int) $booking->id]];
    }

    /** 404 pour une réservation sans dossier (un séjour), lue par son id. */
    public function assertHasDossier(Booking $booking): void
    {
        abort_code_if($this->kindOf($booking) === BookingKind::Stay, 404, 'booking.dossier_not_found');
    }

    private function assertOpen(Booking $booking): void
    {
        abort_code_unless(in_array($booking->status, self::OUVERTS, true), 422, 'booking.dossier_closed');
    }

    private function kindOf(Booking $booking): ?BookingKind
    {
        $kind = array_key_exists('kind', $booking->getAttributes())
            ? $booking->kind
            : Booking::query()->whereKey($booking->getKey())->value('kind');

        return $kind instanceof BookingKind ? $kind : BookingKind::tryFrom((string) $kind);
    }

    /** @param  list<DossierPiece>  $pieces */
    private function insertPieces(Booking $booking, array $pieces): void
    {
        if ($pieces === []) {
            return;
        }

        $now = now();
        BookingDossierItem::query()->insertOrIgnore(array_map(fn (DossierPiece $p): array => [
            'booking_id' => $booking->id,
            'piece' => $p->value,
            'required' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ], $pieces));
    }
}
