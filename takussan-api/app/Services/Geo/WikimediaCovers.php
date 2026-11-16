<?php

namespace App\Services\Geo;

use App\Models\GeoNeighborhood;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * TCK-2844 (ADR-0109 §2) — les photos de quartier que Wikimedia Commons propose au super-admin.
 *
 * **Seuls les fichiers dont `extmetadata.AttributionRequired` vaut exactement `"false"`** : la
 * décision 3 (c) — aucun crédit affiché — n'est tenable que sur eux. Une mention absente vaut
 * « exigée ». Commons rend `"true"`/`"false"` en CHAÎNES.
 *
 * Aucune donnée d'utilisateur ne part : la requête porte le nom du quartier, celui de sa ville, et
 * le User-Agent de l'application (`services.wikimedia.user_agent`).
 */
final class WikimediaCovers
{
    /** La largeur sous laquelle une photo ne fait pas une tuile nette. */
    public const LARGEUR_MIN = 800;

    /** La largeur de la vignette d'une proposition, dans la console. */
    private const LARGEUR_VIGNETTE = 400;

    /**
     * La largeur demandée pour l'IMPORT : Commons rend une vignette à une largeur voisine qu'il
     * arrondit lui-même (1600 demandés → 1920 rendus, mesuré), ou l'original s'il est plus étroit. La conversion servie fait 1200 px au plus ; un original de 20 Mo
     * dépasserait la borne de 10 Mo sans rien apporter.
     */
    private const LARGEUR_IMPORT = 1600;

    private const RESULTATS_MAX = 30;

    /**
     * Les seuls hôtes d'où une image se télécharge. Mesuré sur le vrai Commons le 2026-11-15 : une
     * vignette (`thumburl`) est servie par `thumb.wikimedia.org` ; quand l'original est plus étroit
     * que la largeur demandée, `thumburl` est l'original, sur `upload.wikimedia.org`.
     */
    public const HOTES_DE_TELECHARGEMENT = ['upload.wikimedia.org', 'thumb.wikimedia.org'];

    /**
     * @return array{items: list<array{title: string, thumb_url: string, width: int, height: int, author: ?string, license: ?string, page_url: string}>, unavailable: bool}
     */
    public function suggestions(GeoNeighborhood $quartier): array
    {
        $quartier->loadMissing('city');

        try {
            $pages = $this->lire([
                'generator' => 'search',
                'gsrnamespace' => 6,
                'gsrsearch' => trim($quartier->name.' '.($quartier->city->name ?? '')).' filetype:bitmap',
                'gsrlimit' => self::RESULTATS_MAX,
                'iiurlwidth' => self::LARGEUR_VIGNETTE,
            ]);
        } catch (CommonsIndisponible) {
            return ['items' => [], 'unavailable' => true];
        }

        // `formatversion=2` : une liste, dont l'ordre n'est PAS celui de la recherche — `index` l'est.
        usort($pages, fn (array $a, array $b) => ((int) ($a['index'] ?? PHP_INT_MAX)) <=> ((int) ($b['index'] ?? PHP_INT_MAX)));

        $items = [];
        foreach ($pages as $page) {
            $fichier = $this->fichierDePage($page);
            if ($fichier === null || $fichier['attribution_required'] || $fichier['width'] < self::LARGEUR_MIN || $fichier['thumb_url'] === null) {
                continue;
            }
            $items[] = [
                'title' => $fichier['title'],
                'thumb_url' => $fichier['thumb_url'],
                'width' => $fichier['width'],
                'height' => $fichier['height'],
                'author' => $fichier['author'],
                'license' => $fichier['license'],
                'page_url' => $fichier['page_url'],
            ];
        }

        return ['items' => $items, 'unavailable' => false];
    }

    /**
     * Le fichier `$title` relu sur Commons au moment de l'import, ou `null` s'il n'existe pas.
     * `download_url` est la vignette à {@see self::LARGEUR_IMPORT} px, à défaut l'original.
     *
     * @return array{title: string, download_url: string, thumb_url: ?string, width: int, height: int, author: ?string, license: ?string, page_url: string, attribution_required: bool}|null
     *
     * @throws CommonsIndisponible
     */
    public function fichier(string $title): ?array
    {
        $pages = $this->lire(['titles' => $title, 'iiurlwidth' => self::LARGEUR_IMPORT]);

        foreach ($pages as $page) {
            if (($page['missing'] ?? false) === true || ($page['invalid'] ?? false) === true) {
                continue;
            }
            $fichier = $this->fichierDePage($page);
            if ($fichier !== null) {
                return $fichier;
            }
        }

        return null;
    }

    /**
     * Télécharge `$url` dans un fichier temporaire, ou rend `null` s'il n'est pas recevable :
     * hors de {@see self::HOTES_DE_TELECHARGEMENT} (refusé SANS être appelé), plus de 10 Mo, ou pas une
     * image JPEG, PNG ou WebP au vu de ses octets. Aucune redirection n'est suivie.
     *
     * @throws CommonsIndisponible
     */
    public function telecharger(string $url): ?string
    {
        if (! self::hoteAdmis($url)) {
            return null;
        }

        $max = GeoNeighborhood::COVER_MAX_KO * 1024;
        try {
            $reponse = Http::withUserAgent((string) config('services.wikimedia.user_agent'))
                ->withOptions(['allow_redirects' => false, 'stream' => true])
                ->connectTimeout(3)
                ->timeout((int) config('services.wikimedia.download_timeout', 20))
                ->get($url);
        } catch (ConnectionException $e) {
            throw new CommonsIndisponible($e->getMessage(), previous: $e);
        }
        if (! $reponse->successful()) {
            throw new CommonsIndisponible('Le serveur d\'images de Wikimedia a répondu '.$reponse->status());
        }
        if ((int) $reponse->header('Content-Length') > $max) {
            return null;
        }

        // Lu par morceaux, borné : un `Content-Length` absent ou menteur ne remplit pas la mémoire.
        $flux = $reponse->toPsrResponse()->getBody();
        $octets = '';
        while (! $flux->eof()) {
            $octets .= $flux->read(65536);
            if (strlen($octets) > $max) {
                return null;
            }
        }

        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($octets);
        if (! in_array($mime, GeoNeighborhood::COVER_MIMES, true)) {
            return null;
        }

        $chemin = tempnam(sys_get_temp_dir(), 'geo-cover');
        file_put_contents($chemin, $octets);

        return $chemin;
    }

    /** `https`, hôte EXACTEMENT l'un de {@see self::HOTES_DE_TELECHARGEMENT} (pas de suffixe), ni identifiants ni port. */
    public static function hoteAdmis(string $url): bool
    {
        $parties = parse_url($url);

        return is_array($parties)
            && ($parties['scheme'] ?? '') === 'https'
            && in_array(strtolower((string) ($parties['host'] ?? '')), self::HOTES_DE_TELECHARGEMENT, true)
            && ! isset($parties['pass'])
            && ! isset($parties['user'])
            && ! isset($parties['port']);
    }

    /**
     * @param  array<string, mixed>  $parametres
     * @return list<array<string, mixed>>
     *
     * @throws CommonsIndisponible
     */
    private function lire(array $parametres): array
    {
        try {
            $reponse = $this->client()->get((string) config('services.wikimedia.endpoint'), $parametres + [
                'action' => 'query',
                'format' => 'json',
                'formatversion' => 2,
                'prop' => 'imageinfo',
                'iiprop' => 'url|size|extmetadata',
                'iiextmetadatafilter' => 'AttributionRequired|LicenseShortName|Artist|ImageDescription',
            ]);
        } catch (ConnectionException $e) {
            throw new CommonsIndisponible($e->getMessage(), previous: $e);
        }

        $corps = $reponse->successful() ? $reponse->json() : null;
        if (! is_array($corps) || isset($corps['error'])) {
            throw new CommonsIndisponible('Commons a répondu '.$reponse->status());
        }

        $pages = $corps['query']['pages'] ?? [];

        return is_array($pages) ? array_values(array_filter($pages, 'is_array')) : [];
    }

    private function client(): PendingRequest
    {
        return Http::withUserAgent((string) config('services.wikimedia.user_agent'))
            ->acceptJson()
            ->connectTimeout(min(3, (int) config('services.wikimedia.timeout', 5)))
            ->timeout((int) config('services.wikimedia.timeout', 5));
    }

    /**
     * @param  array<string, mixed>  $page
     * @return array{title: string, download_url: string, thumb_url: ?string, width: int, height: int, author: ?string, license: ?string, page_url: string, attribution_required: bool}|null
     */
    private function fichierDePage(array $page): ?array
    {
        $info = $page['imageinfo'][0] ?? null;
        if (! is_array($info) || ! is_string($info['url'] ?? null) || ! is_string($page['title'] ?? null)) {
            return null;
        }
        $meta = is_array($info['extmetadata'] ?? null) ? $info['extmetadata'] : [];
        $thumb = is_string($info['thumburl'] ?? null) ? $info['thumburl'] : null;

        return [
            'title' => $page['title'],
            'download_url' => $thumb ?? $info['url'],
            'thumb_url' => $thumb,
            'width' => (int) ($info['width'] ?? 0),
            'height' => (int) ($info['height'] ?? 0),
            'author' => $this->texte($meta['Artist']['value'] ?? null),
            'license' => $this->texte($meta['LicenseShortName']['value'] ?? null),
            'page_url' => is_string($info['descriptionurl'] ?? null) ? $info['descriptionurl'] : '',
            // Strictement `"false"` : une mention absente ou inattendue vaut « exigée ».
            'attribution_required' => ($meta['AttributionRequired']['value'] ?? null) !== 'false',
        ];
    }

    /** `Artist` est du HTML : du texte seul, espaces repliés, `null` s'il ne reste rien. */
    private function texte(mixed $html): ?string
    {
        if (! is_string($html)) {
            return null;
        }
        $texte = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $texte = trim((string) preg_replace('/\s+/u', ' ', str_replace("\u{00A0}", ' ', $texte)));

        return $texte === '' ? null : $texte;
    }
}
