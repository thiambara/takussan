<?php

namespace Tests\Support;

/**
 * Qui consomme un dictionnaire de `lang/` — l'arête que la carte d'impact n'a pas.
 *
 * `tests/impact-map.json` est dérivée d'un rapport de couverture, et la couverture
 * ne mesure que `app/` : un fichier de `lang/` n'y figure donc à AUCUN titre, et
 * `ImpactSelector` le traitait comme un chemin inconnu — donc suite entière
 * (TCK-476). Ce n'était pas un défaut du repli, c'était sa FRÉQUENCE : les
 * dictionnaires changent souvent, et l'outil du quotidien retombait sur son pire
 * cas.
 *
 * Cette classe rétablit l'arête manquante par la seule voie disponible sans
 * régénérer la carte : `lang/<locale>/<domaine>.php` → les fichiers qui CITENT une
 * clé de ce domaine. Elle est le seul point de cette famille qui touche le disque —
 * `ImpactSelector` reste pur et reçoit un `Closure`.
 *
 * ⚠ **DEUX ordres de recherche, et le second n'est pas un raffinement.** Mesuré le
 * 2026-08-30 sur `lang/<locale>/invitations.php` : les cinq fichiers de `app/` qui écrivent
 * `'invitations.…'` NE CONTIENNENT PAS `app/Mail/InvitationMailable.php`, qui rend
 * pourtant `emails.invitation` — la vue qui porte, elle, les clés du domaine. Une
 * règle limitée au premier ordre aurait donc oublié les tests qui couvrent ce
 * Mailable : *une carte d'impact qui va plus vite en oubliant un test est pire que
 * celle qui lance tout.* D'où le second ordre, vue → ce qui la rend.
 *
 * ⚠ **Ce qu'elle NE sait PAS faire, et comment elle le dit.** Une vue dont aucun
 * fichier de `app/`/`tests/` ne cite le nom reste dans le résultat SOUS SON PROPRE
 * CHEMIN (`resources/views/…`). L'appelant ne sait pas la situer, et escalade —
 * c'est voulu : le doute se rend visible, il ne se comble pas en silence.
 */
final class TranslationUsage
{
    /** Là où un consommateur de dictionnaire peut vivre. */
    private const ROOTS = ['app', 'tests', 'resources/views'];

    /** @var array<string,string>|null chemin relatif → contenu, index paresseux. */
    private ?array $sources = null;

    public function __construct(private readonly string $apiRoot) {}

    /**
     * Les fichiers qui consomment le domaine `$domain`, chemins relatifs à
     * `takussan-api/`.
     *
     * @return list<string>
     */
    public function consumersOf(string $domain): array
    {
        if (! preg_match('/^[a-z0-9_-]+$/', $domain)) {
            return [];
        }

        $found = [];

        // Premier ordre : `__('invitations.accepted')`, `enumLabel($e, 'properties.type')`,
        // `Lang::get('properties.type.'.$case->value)` — tous écrivent le domaine suivi
        // d'un point, collé au guillemet ouvrant.
        foreach ($this->matching('/[\'"]'.preg_quote($domain, '/').'\./') as $path) {
            $found[$path] = true;
        }

        // Second ordre : une vue qui porte les clés est rendue depuis `app/`, et le
        // fichier qui la rend ne cite en général AUCUNE clé (cf. docblock).
        foreach (array_keys($found) as $path) {
            if (! str_starts_with($path, 'resources/views/')) {
                continue;
            }

            foreach ($this->matching($this->viewNamePattern($path)) as $renderer) {
                if (! str_starts_with($renderer, 'resources/views/')) {
                    $found[$renderer] = true;
                    unset($found[$path]);
                }
            }
        }

        $paths = array_keys($found);
        sort($paths);

        return $paths;
    }

    /**
     * `resources/views/emails/notifications/digest.blade.php` → une expression qui
     * reconnaît `'emails.notifications.digest'` SANS reconnaître
     * `'emails.notifications.notification-digest'` : les deux existent, et le
     * délimiteur de fin est ce qui les sépare.
     */
    private function viewNamePattern(string $viewPath): string
    {
        $name = substr($viewPath, strlen('resources/views/'));
        $name = preg_replace('/\.blade\.php$|\.php$/', '', $name);

        return '/[\'"]'.preg_quote(str_replace('/', '.', (string) $name), '/').'[\'"]/';
    }

    /**
     * @return list<string>
     */
    private function matching(string $pattern): array
    {
        $hits = [];

        foreach ($this->sources() as $path => $contents) {
            if (preg_match($pattern, $contents) === 1) {
                $hits[] = $path;
            }
        }

        return $hits;
    }

    /**
     * Le contenu, COMMENTAIRES RETIRÉS. Une clé citée dans une prose n'est pas une
     * consommation — et ce n'est pas une précaution théorique : la première mesure de
     * TCK-476 a fait escalader `lang/en/invitations.php` sur `tests/Support/TranslationUsage.php`,
     * c'est-à-dire sur CE fichier, parce que son propre docblock cite une clé en exemple.
     * Un balayage naïf se prend lui-même pour un consommateur.
     *
     * ⚠ Seulement quand le fichier est du PHP franc. Dans une vue Blade, la clé vit dans
     * `{{ __('…') }}`, donc dans du `T_INLINE_HTML` : `token_get_all()` n'y verrait rien à
     * retirer, et un `{{-- commentaire --}}` resterait de toute façon. On y garde le texte
     * brut — un faux positif de vue ne fait qu'élargir la sélection.
     */
    private static function withoutComments(string $contents): string
    {
        if (! str_starts_with(ltrim($contents), '<?php')) {
            return $contents;
        }

        $out = '';

        foreach (token_get_all($contents) as $token) {
            if (! is_array($token)) {
                $out .= $token;

                continue;
            }

            if ($token[0] === T_COMMENT || $token[0] === T_DOC_COMMENT) {
                continue;
            }

            $out .= $token[1];
        }

        return $out;
    }

    /** @return array<string,string> */
    private function sources(): array
    {
        if ($this->sources !== null) {
            return $this->sources;
        }

        $this->sources = [];

        foreach (self::ROOTS as $root) {
            $absolute = $this->apiRoot.'/'.$root;

            if (! is_dir($absolute)) {
                continue;
            }

            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($absolute, \FilesystemIterator::SKIP_DOTS),
            );

            foreach ($iterator as $file) {
                if (! $file->isFile() || $file->getExtension() !== 'php') {
                    continue;
                }

                $this->sources[$root.'/'.substr($file->getPathname(), strlen($absolute) + 1)]
                    = self::withoutComments((string) file_get_contents($file->getPathname()));
            }
        }

        return $this->sources;
    }
}
