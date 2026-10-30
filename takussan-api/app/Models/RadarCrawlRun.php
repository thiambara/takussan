<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\RadarCrawlStatus;
use App\Models\Enums\RadarCrawlTrigger;
use App\Models\Enums\RadarSourceSite;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * TCK-2392 (ADR-0077 §10) — un passage de collecte sur un site : ce qu'il a lu (`pages_read`, `cards_seen`), ce qu'il a
 * trouvé (`listings_created`, `listings_known`, `snapshots_opened`), et pourquoi il s'est arrêté (`stop_reason`, un code
 * `radar.crawl.*` ou `radar.fetch.*`). `reached_end` : il a lu la dernière page — sans lui, une annonce non revue n'a
 * pas forcément disparu.
 */
class RadarCrawlRun extends AbstractModel
{
    public const STOP_END = 'radar.crawl.end';

    public const STOP_MAX_PAGES = 'radar.crawl.max_pages';

    public const STOP_NO_CARDS = 'radar.crawl.no_cards';

    public const STOP_BUSY = 'radar.crawl.domain_busy';

    public const STOP_ERROR = 'radar.crawl.error';

    public const STOP_NO_OPERATOR = 'radar.crawl.no_operator';

    protected $fillable = [
        'site', 'trigger', 'status', 'operator_id', 'started_at', 'finished_at', 'pages_read', 'cards_seen',
        'listings_created', 'listings_known', 'snapshots_opened', 'reached_end', 'stop_reason',
    ];

    protected $casts = [
        'site' => RadarSourceSite::class,
        'trigger' => RadarCrawlTrigger::class,
        'status' => RadarCrawlStatus::class,
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
        'pages_read' => 'integer',
        'cards_seen' => 'integer',
        'listings_created' => 'integer',
        'listings_known' => 'integer',
        'snapshots_opened' => 'integer',
        'reached_end' => 'boolean',
    ];

    protected static array $requestFilterable = ['site', 'status'];

    protected static array $requestSortable = ['created_at'];

    protected static array $queryFields = [
        'id', 'site', 'trigger', 'status', 'operator_id', 'started_at', 'finished_at', 'pages_read', 'cards_seen',
        'listings_created', 'listings_known', 'snapshots_opened', 'reached_end', 'stop_reason', 'created_at', 'updated_at',
    ];

    public function operator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operator_id');
    }

    public function listings(): HasMany
    {
        return $this->hasMany(RadarListing::class, 'discovered_by_run_id');
    }
}
