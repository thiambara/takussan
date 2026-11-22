<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Feedback window (hours)
    |--------------------------------------------------------------------------
    |
    | How long after a visit is marked `completed` customers and agents can
    | still leave feedback. Past this cutoff the `feedback` endpoint returns
    | 422. Set via the `VISITS_FEEDBACK_WINDOW_HOURS` env var.
    |
    */
    'feedback_window_hours' => (int) env('VISITS_FEEDBACK_WINDOW_HOURS', 24),

    /*
    |--------------------------------------------------------------------------
    | Report pending window (days) — TCK-2578, ADR-0101 § 6
    |--------------------------------------------------------------------------
    |
    | A `completed` visit without an agency report stays « à clore »
    | (`filter[to_close]=1`) for this many days after `completed_at`. The
    | report itself has no window: it can be written or edited at any time.
    | Default 7, decided by the product owner on 2026-11-10 — a setting,
    | not a rule.
    |
    */
    'report_pending_days' => 7,
];
