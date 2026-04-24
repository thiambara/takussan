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
];
