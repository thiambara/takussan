<?php

namespace App\Models\Concerns;

use App\Services\Media\PrivateMediaAccess;
use App\Support\Media\VoiceNoteRules;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\UploadedFile;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-2900 (ADR-0113 § 2) — la note vocale d'un modèle qui n'est pas un message : un fichier de la
 * collection `voice_notes`, PRIVÉE (aucun `useDisk` : le disque privé par défaut, ADR-0029), une note
 * au plus (`singleFile`), sa durée déclarée dans `custom_properties.duration`. Les bornes sont celles
 * de {@see VoiceNoteRules}, que la requête du porteur applique.
 *
 * Le modèle porteur implémente `HasMedia` + `InteractsWithMedia` et appelle
 * {@see self::registerVoiceNotesCollection()} depuis son `registerMediaCollections()`.
 * La note n'est jamais lue que par la porte des fichiers privés ({@see PrivateMediaAccess}), émise
 * dans une réponse déjà autorisée.
 */
trait HasVoiceNotes
{
    public const VOICE_NOTES_COLLECTION = 'voice_notes';

    /** L'attribut que pose {@see self::scopeWithVoiceNoteFlag()} sur une liste. */
    public const HAS_VOICE_NOTE_ATTRIBUTE = 'has_voice_note';

    protected function registerVoiceNotesCollection(): void
    {
        $this->addMediaCollection(self::VOICE_NOTES_COLLECTION)->singleFile();
    }

    /** Dépose la note (un fichier déjà validé par {@see VoiceNoteRules}) et sa durée déclarée. */
    public function attachVoiceNote(UploadedFile $file, int $durationSeconds): Media
    {
        return $this->addMedia($file)
            ->withCustomProperties(['duration' => $durationSeconds])
            ->toMediaCollection(self::VOICE_NOTES_COLLECTION);
    }

    public function voiceNote(): ?Media
    {
        return $this->getFirstMedia(self::VOICE_NOTES_COLLECTION);
    }

    /**
     * Une liste lit l'attribut posé par {@see self::scopeWithVoiceNoteFlag()} (une sous-requête, pas
     * une requête par ligne) ; une ressource seule lit ses médias chargés, ou les interroge une fois.
     */
    public function hasVoiceNote(): bool
    {
        if (array_key_exists(self::HAS_VOICE_NOTE_ATTRIBUTE, $this->getAttributes())) {
            return (bool) $this->getAttributes()[self::HAS_VOICE_NOTE_ATTRIBUTE];
        }

        return $this->voiceNote() !== null;
    }

    /** `has_voice_note` en sous-requête `exists` : à poser APRÈS les champs choisis (`fields[…]`). */
    public function scopeWithVoiceNoteFlag(Builder $query): void
    {
        $query->withExists([
            'media as '.self::HAS_VOICE_NOTE_ATTRIBUTE => fn (Builder $media) => $media->where('collection_name', self::VOICE_NOTES_COLLECTION),
        ]);
    }

    /**
     * Le bloc de lecture : l'URL est une URL d'API signée (ADR-0029), jamais l'URL du fichier.
     *
     * @return array{id: int, url: string, duration: ?int, mime_type: ?string}|null
     */
    public function voiceNoteBlock(): ?array
    {
        $media = $this->voiceNote();
        if (! $media instanceof Media) {
            return null;
        }

        $duration = $media->getCustomProperty('duration');

        return [
            'id' => (int) $media->getKey(),
            'url' => app(PrivateMediaAccess::class)->signedUrl($media),
            'duration' => is_numeric($duration) ? (int) $duration : null,
            'mime_type' => $media->mime_type,
        ];
    }
}
