<?php

namespace App\Models;

use App\Http\Controllers\Api\DocumentVaultArchiveController;
use App\Jobs\Documents\BatirLArchiveDuCoffreJob;
use App\Jobs\Documents\PurgerLesArchivesDuCoffre;
use App\Models\Bases\AbstractModel;
use App\Models\Enums\DocumentVaultArchiveStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Profiles\ServiceProviderProfile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

/**
 * TCK-2812 (ADR-0099, amendement du 2026-11-14) — une préparation de l'archive d'un dossier du coffre,
 * au-delà du seuil synchrone de TCK-2770 : son demandeur, le profil actif de la demande, le dossier, son
 * état, et le fichier qu'elle a écrit.
 *
 * Elle ne garde AUCUNE entrée du dossier : le coffre se rejuge à la construction
 * ({@see BatirLArchiveDuCoffreJob}). Le fichier vit sur le disque des médias privés,
 * sous un nom opaque ; il ne sort que par la route signée réservée au demandeur
 * ({@see DocumentVaultArchiveController::download()}), et la purge l'efface à
 * l'expiration ({@see PurgerLesArchivesDuCoffre}).
 *
 * @property int $id
 * @property string $uuid
 * @property int $user_id
 * @property ?string $profile_type
 * @property ?int $profile_id
 * @property string $folder
 * @property string $locale
 * @property DocumentVaultArchiveStatus $status
 * @property ?string $error_code
 * @property ?string $disk
 * @property ?string $path
 * @property ?int $size
 * @property ?int $entries_count
 * @property ?Carbon $expires_at
 */
class DocumentVaultArchive extends AbstractModel
{
    /** La durée de vie d'une archive prête, et de son lien (ADR-0099, amendement du 2026-11-14, § 7). */
    public const DUREE_EN_HEURES = 24;

    /** La racine des archives sur le disque des médias privés : `archives-du-coffre/{user}/{uuid}.zip`. */
    public const RACINE = 'archives-du-coffre';

    /** Les seuls profils qu'une préparation réinstalle : jamais une classe lue en base sans liste. */
    private const PROFILS = [
        OwnerProfile::class, AgentProfile::class, AgencyAdminProfile::class,
        ServiceProviderProfile::class, PlatformProfile::class,
    ];

    protected $fillable = [
        'uuid', 'user_id', 'profile_type', 'profile_id', 'folder', 'locale', 'status',
        'error_code', 'disk', 'path', 'size', 'entries_count', 'expires_at',
    ];

    // Le chemin ne sort jamais : le lien signé est la seule porte du fichier.
    protected $hidden = ['disk', 'path'];

    protected $casts = [
        'status' => DocumentVaultArchiveStatus::class,
        'size' => 'integer',
        'entries_count' => 'integer',
        'expires_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Le profil actif de la demande, relu à la construction ; `null` sans profil. `false` quand la
     * demande en avait un qui n'existe plus ou n'est plus celui du demandeur : le coffre ne se juge
     * alors sous aucun profil, et la préparation échoue.
     */
    public function profil(): Model|false|null
    {
        if ($this->profile_type === null || $this->profile_id === null) {
            return null;
        }
        if (! in_array($this->profile_type, self::PROFILS, true)) {
            return false;
        }

        /** @var class-string<Model> $classe */
        $classe = $this->profile_type;
        $profil = $classe::query()->whereKey($this->profile_id)->first();

        return $profil !== null && (int) $profil->getAttribute('user_id') === (int) $this->user_id ? $profil : false;
    }

    /** Le chemin opaque du fichier : le dossier du demandeur, puis l'identifiant de la préparation. */
    public static function cheminPour(int $userId, string $uuid): string
    {
        return self::RACINE."/{$userId}/{$uuid}.zip";
    }

    /**
     * Efface le fichier de la préparation : celui qu'elle a rangé, sinon son chemin opaque sur le disque
     * des médias privés (un travail perdu entre l'écriture et l'état). Idempotent.
     */
    public function effacerLeFichier(): void
    {
        if ($this->disk !== null && $this->path !== null) {
            Storage::disk($this->disk)->delete($this->path);

            return;
        }
        Storage::disk((string) config('media-library.disk_name'))->delete(self::cheminPour($this->user_id, $this->uuid));
    }

    public function estPrete(): bool
    {
        return $this->status === DocumentVaultArchiveStatus::Ready
            && $this->expires_at !== null
            && $this->expires_at->isFuture();
    }
}
