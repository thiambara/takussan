<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Spatie\MediaLibrary\Support\PathGenerator\PathGeneratorFactory;
use Throwable;

/**
 * Moves media files from one disk to another — TCK-538, ADR-0029.
 *
 * Two modes:
 *
 *   media:move-disk public --to-declared   each row goes to the disk its MODEL declares for its
 *                                          collection — originals and conversions separately
 *                                          (`useDisk()` / `storeConversionsOnDisk()`). This is
 *                                          the mode of a migration: nothing to enumerate by hand.
 *   media:move-disk public r2-media        every row goes to `r2-media` — REFUSED, before any
 *                                          write, if one row's declared disk is not `r2-media`,
 *                                          unless `--force`.
 *
 * ⚠ The refusal exists because of D-1 (TCK-538): the runbook « public → r2-media, then private
 * collections → r2-private » moved every row of `public` — KYC and documents included — into the
 * PUBLIC bucket, and the second command then found nothing. The declared disk is read from the
 * model (`getMediaCollection()`), never from a list: a collection added tomorrow is covered.
 *
 * Per row, the original (on `disk`) and every file of its conversions and responsive-images
 * directories (on `conversions_disk`) are copied by stream — a file never lands whole in memory,
 * and nothing relies on a local path. Only once every file of a row is copied does the row
 * switch — an interrupted run leaves rows pointing at their intact source, and a rerun picks
 * them up again. Idempotent: a row with nothing left on `from` to move is skipped. The source is
 * deleted only with `--delete-source`, and only after the row has switched.
 */
class MediaMoveDisk extends Command
{
    protected $signature = 'media:move-disk
        {from : Source disk (e.g. public, local)}
        {to? : Target disk for EVERY row (e.g. r2-media) — or use --to-declared}
        {--to-declared : Send each row to the disks its model declares for its collection}
        {--collection=* : Only these collection names (repeatable)}
        {--force : With an explicit {to}, move rows whose declared disk is another one}
        {--dry-run : Count and list, write nothing}
        {--delete-source : Delete the source files once the row has switched}';

    protected $description = 'Move media files (original, conversions, responsive images) to their declared disk, or to an explicit one.';

    /** @var array<string, array{0: string, 1: string}|null> declared disks, per model class + collection */
    private array $declared = [];

    public function handle(): int
    {
        $from = (string) $this->argument('from');
        $to = $this->argument('to');
        $toDeclared = (bool) $this->option('to-declared');
        $collections = array_values(array_filter((array) $this->option('collection')));
        $dryRun = (bool) $this->option('dry-run');
        $deleteSource = (bool) $this->option('delete-source');

        if ($toDeclared === ($to !== null)) {
            $this->error('media:move-disk: give either a target disk {to} or --to-declared, not both, not neither.');

            return self::FAILURE;
        }

        if ($to === $from) {
            $this->error("media:move-disk: source and target are the same disk [{$from}].");

            return self::FAILURE;
        }

        foreach (array_filter([$from, $to]) as $name) {
            if (! $this->diskExists($name)) {
                $this->error("media:move-disk: disk [{$name}] is not configured.");

                return self::FAILURE;
            }
        }

        $scope = fn () => Media::query()
            ->when($collections !== [], fn ($q) => $q->whereIn('collection_name', $collections));

        // ── 1. The plan — computed ENTIRELY before the first write ─────────────────────────────
        $plan = [];
        $refused = [];
        $skipped = 0;

        $scope()
            ->where(fn ($q) => $q->where('disk', $from)->orWhere('conversions_disk', $from))
            ->chunkById(200, function ($chunk) use ($from, $to, &$plan, &$refused, &$skipped) {
                foreach ($chunk as $media) {
                    /** @var Media $media */
                    $declared = $this->declaredDisks($media);
                    $label = "#{$media->getKey()} {$media->model_type}::{$media->collection_name}";

                    if ($declared === null) {
                        $refused[] = "{$label} — declared disk cannot be resolved (model class missing)";

                        continue;
                    }

                    [$declaredDisk, $declaredConversions] = $declared;

                    // Which parts are on `from`, and where each would go.
                    $original = $media->disk === $from ? ($to ?? $declaredDisk) : null;
                    $derived = $media->conversions_disk === $from ? ($to ?? $declaredConversions) : null;

                    if ($to !== null && ! $this->option('force')) {
                        $mismatch = array_filter([
                            $original !== null && $declaredDisk !== $to ? "original declared on [{$declaredDisk}]" : null,
                            $derived !== null && $declaredConversions !== $to ? "conversions declared on [{$declaredConversions}]" : null,
                        ]);

                        if ($mismatch !== []) {
                            $refused[] = "{$label} — ".implode(', ', $mismatch).", not [{$to}]";

                            continue;
                        }
                    }

                    // Nothing to do for a part already on its target.
                    $original = $original === $from ? null : $original;
                    $derived = $derived === $from ? null : $derived;

                    if ($original === null && $derived === null) {
                        $skipped++;

                        continue;
                    }

                    foreach (array_filter([$original, $derived]) as $target) {
                        if (! $this->diskExists($target)) {
                            $refused[] = "{$label} — declared disk [{$target}] is not configured";

                            continue 2;
                        }
                    }

                    $plan[$media->getKey()] = ['original' => $original, 'derived' => $derived];
                }
            });

        if ($refused !== []) {
            $this->error('media:move-disk: '.count($refused).' row(s) refused — nothing was written:');
            foreach ($refused as $line) {
                $this->line("  {$line}");
            }
            if ($to !== null) {
                $this->line('  Use --to-declared to send each row to its declared disk, or --collection to narrow, or --force.');
            }

            return self::FAILURE;
        }

        if ($to !== null) {
            $skipped = $scope()->where('disk', $to)->where('conversions_disk', $to)->count();
        }

        // ── 2. The moves ──────────────────────────────────────────────────────────────────────
        $moved = 0;
        $files = 0;
        $failed = 0;

        foreach (array_chunk(array_keys($plan), 200) as $ids) {
            foreach (Media::query()->whereKey($ids)->get() as $media) {
                /** @var Media $media */
                $targets = $plan[$media->getKey()];
                $paths = $this->pathsToMove($media, $from, $targets);
                $count = count($paths['original']) + count($paths['derived']);
                $where = implode(', ', array_filter([
                    $targets['original'] ? "original → {$targets['original']}" : null,
                    $targets['derived'] ? "conversions → {$targets['derived']}" : null,
                ]));

                if ($dryRun) {
                    $this->line("  #{$media->getKey()} {$media->collection_name} — {$count} file(s), {$where}");
                    $moved++;
                    $files += $count;

                    continue;
                }

                try {
                    $this->copyAll($paths['original'], $from, $targets['original']);
                    $this->copyAll($paths['derived'], $from, $targets['derived']);
                } catch (Throwable $e) {
                    $this->warn("  #{$media->getKey()} not moved: {$e->getMessage()}");
                    $failed++;

                    continue;
                }

                // `saveQuietly()` DÉLIBÉRÉ — ne pas le « corriger » en `save()` pour réveiller la
                // purge de MediaCdnObserver : changer de disque change le DOMAINE de l'URL, donc la
                // clé de cache ; l'ancienne entrée n'est plus jamais demandée. Et le CDN est
                // désactivé (CDN_ENABLED=false). Décision de session, 2026-09-21.
                $media->forceFill([
                    'disk' => $targets['original'] ?? $media->disk,
                    'conversions_disk' => $targets['derived'] ?? $media->conversions_disk,
                ])->saveQuietly();

                if ($deleteSource) {
                    Storage::disk($from)->delete(array_merge($paths['original'], $paths['derived']));
                }

                $moved++;
                $files += $count;
            }
        }

        $verb = $dryRun ? 'would move' : 'moved';
        $target = $to ?? 'declared disks';
        $this->info("media:move-disk {$from} → {$target}: {$verb} {$moved} media ({$files} file(s)), skipped {$skipped} already on {$target}, {$failed} failed.");

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }

    /**
     * The disks the row's MODEL declares for its collection, resolved as spatie resolves them at
     * upload (`FileAdder::determineDiskName()` / `determineConversionsDiskName()`): the
     * collection's `useDisk()`, else `media-library.disk_name`; its `storeConversionsOnDisk()`,
     * else `media-library.conversions_disk_name`, else the original's disk.
     *
     * @return array{0: string, 1: string}|null null when the model class cannot be resolved
     */
    protected function declaredDisks(Media $media): ?array
    {
        $class = Relation::getMorphedModel($media->model_type) ?? $media->model_type;
        $key = "{$class}::{$media->collection_name}";

        if (array_key_exists($key, $this->declared)) {
            return $this->declared[$key];
        }

        if (! is_string($class) || ! class_exists($class) || ! is_subclass_of($class, HasMedia::class)) {
            return $this->declared[$key] = null;
        }

        /** @var HasMedia $model */
        $model = new $class;
        $collection = $model->getMediaCollection($media->collection_name);

        $disk = ($collection?->diskName ?: null) ?? (string) config('media-library.disk_name');
        $conversions = ($collection?->conversionsDiskName ?: null)
            ?? (config('media-library.conversions_disk_name') ?: null)
            ?? $disk;

        return $this->declared[$key] = [$disk, $conversions];
    }

    /**
     * The files of a row that live on `$from` and have a target, grouped by origin.
     *
     * Conversions and responsive images are LISTED, not rebuilt from
     * `generated_conversions`: a conversion file name depends on the file
     * namer and the conversion's format, and listing is what cannot miss one.
     *
     * @param  array{original: ?string, derived: ?string}  $targets
     * @return array{original: list<string>, derived: list<string>}
     */
    protected function pathsToMove(Media $media, string $from, array $targets): array
    {
        $generator = PathGeneratorFactory::create($media);
        $paths = ['original' => [], 'derived' => []];

        if ($targets['original'] !== null) {
            $paths['original'][] = $generator->getPath($media).$media->file_name;
        }

        if ($targets['derived'] !== null) {
            $disk = Storage::disk($from);
            $derived = array_merge(
                $disk->files($generator->getPathForConversions($media)),
                $disk->files($generator->getPathForResponsiveImages($media)),
            );
            $paths['derived'] = array_values(array_unique(array_diff($derived, [$generator->getPath($media).$media->file_name])));
        }

        return $paths;
    }

    /**
     * @param  list<string>  $paths
     */
    protected function copyAll(array $paths, string $from, ?string $to): void
    {
        if ($paths === [] || $to === null) {
            return;
        }

        $source = Storage::disk($from);
        $target = Storage::disk($to);

        foreach ($paths as $path) {
            $this->copyOne($source, $target, $path);
        }
    }

    protected function copyOne(Filesystem $source, Filesystem $target, string $path): void
    {
        $stream = $source->readStream($path);

        if (! is_resource($stream)) {
            throw new \RuntimeException("cannot read [{$path}] on the source disk");
        }

        try {
            if (! $target->writeStream($path, $stream)) {
                throw new \RuntimeException("cannot write [{$path}] on the target disk");
            }
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }
    }

    private function diskExists(string $name): bool
    {
        try {
            Storage::disk($name);

            return true;
        } catch (Throwable) {
            return false;
        }
    }
}
