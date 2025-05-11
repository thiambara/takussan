<?php

namespace App\Services\Model;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

class ActivityLogService
{
    /**
     * Log a model creation
     */
    public function logCreated(Model $model, ?string $description = null): ActivityLog
    {
        if (!$description) {
            $modelName = class_basename($model);
            $description = "$modelName created";
        }

        return $this->log('create', $description, $model);
    }

    /**
     * Log an activity
     */
    public function log(string $action, string $description, ?Model $model = null, ?array $changes = null): ActivityLog
    {
        $data = [
            'user_id' => Auth::id(),
            'action' => $action,
            'description' => $description,
            'changes' => $changes,
            'ip_address' => Request::ip(),
            'user_agent' => Request::userAgent(),
        ];

        if ($model) {
            $data['loggable_id'] = $model->id;
            $data['loggable_type'] = get_class($model);
        }

        return ActivityLog::create($data);
    }

    /**
     * Log a model update
     */
    public function logUpdated(Model $model, array $changes, ?string $description = null): ActivityLog
    {
        if (!$description) {
            $modelName = class_basename($model);
            $description = "$modelName updated";
        }

        return $this->log('update', $description, $model, $changes);
    }

    /**
     * Log a model deletion
     */
    public function logDeleted(Model $model, ?string $description = null): ActivityLog
    {
        if (!$description) {
            $modelName = class_basename($model);
            $description = "$modelName deleted";
        }

        return $this->log('delete', $description, $model);
    }

    /**
     * Log a user login
     */
    public function logLogin(int $userId): ActivityLog
    {
        return ActivityLog::create([
            'user_id' => $userId,
            'loggable_id' => $userId,
            'loggable_type' => User::class,
            'action' => 'login',
            'description' => 'User logged in',
            'ip_address' => Request::ip(),
            'user_agent' => Request::userAgent(),
        ]);
    }

    /**
     * Log a user logout
     */
    public function logLogout(int $userId): ActivityLog
    {
        return ActivityLog::create([
            'user_id' => $userId,
            'loggable_id' => $userId,
            'loggable_type' => User::class,
            'action' => 'logout',
            'description' => 'User logged out',
            'ip_address' => Request::ip(),
            'user_agent' => Request::userAgent(),
        ]);
    }

    /**
     * Get activities for a specific user
     */
    public function getUserActivities(int $userId, int $limit = 15): LengthAwarePaginator
    {
        return ActivityLog::where('user_id', $userId)
            ->orderBy('created_at', 'desc')
            ->paginate($limit);
    }

    /**
     * Get activities for a specific model
     */
    public function getModelActivities(string $modelType, int $modelId, int $limit = 15): LengthAwarePaginator
    {
        return ActivityLog::where('loggable_type', $modelType)
            ->where('loggable_id', $modelId)
            ->with('user')
            ->orderBy('created_at', 'desc')
            ->paginate($limit);
    }
}
