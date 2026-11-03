<?php

namespace App\Services\Radar;

use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Spatie\MediaLibrary\Support\PathGenerator\DefaultPathGenerator;

/**
 * TCK-2406 — le chemin des photos que « Publier pour lui » copie dans la collection `photos` d'un bien ({@see RadarPublisher}) :
 * `{root()}/{id du média}/`, original (disque privé) et conversions (disque public) compris, au lieu de `{id du média}/`.
 *
 * Pourquoi un préfixe : une requête coupée par `max_execution_time` laisse ses copies sous un identifiant que la séquence a brûlé,
 * sans ligne `media`, et ni le `catch` ni `discardFiles` ne passent. À la racine, elles se perdraient parmi les milliers de
 * dossiers numériques légitimes du disque public ; ici, tout dossier sans ligne est un orphelin, et {@see RadarOrphanFiles}
 * balaie ce seul préfixe.
 *
 * Le marqueur est une propriété du média, posée à la copie : le chemin se recalcule à chaque lecture (URL, conversions,
 * suppression), il doit donc vivre avec la ligne. Un média sans marqueur — les photos déposées sur un bien, et les copies
 * d'avant TCK-2406 — garde le chemin par défaut. `Media::copy()` recopie les propriétés : la duplication d'un bien publié par
 * le Radar (`PropertyDuplicationService`) range donc aussi les photos du clone sous le préfixe. C'est sans danger : leurs
 * lignes existent, et une duplication coupée y serait balayée de même. Le préfixe est neutre : il paraît dans l'URL publique.
 *
 * ⚠ `MARKER`, `DIRECTORY` et l'enregistrement dans `media-library.custom_path_generators` sont PORTEURS tant qu'une copie existe :
 * en changer un recalcule les chemins des copies vers un endroit où il n'y a aucun fichier. Un retour arrière déplace d'abord
 * les fichiers.
 */
final class RadarCopyPathGenerator extends DefaultPathGenerator
{
    /** La propriété du média qui le range sous le préfixe ; posée par la copie, jamais après (le fichier ne bougerait pas). */
    public const MARKER = 'publication_copy';

    private const DIRECTORY = 'publications';

    /** Le dossier des copies, sous le préfixe global de la médiathèque s'il y en a un. */
    public static function root(): string
    {
        return ltrim(config('media-library.prefix', '').'/'.self::DIRECTORY, '/');
    }

    protected function getBasePath(Media $media): string
    {
        return $media->getCustomProperty(self::MARKER) === true
            ? self::root().'/'.$media->getKey()
            : parent::getBasePath($media);
    }
}
