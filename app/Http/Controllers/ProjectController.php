<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Models\Project;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

class ProjectController extends Controller
{

    public function __construct()
    {
    }


    public function index(): JsonResponse
    {
        $query = Project::allThroughRequest();
        if (auth()->user()->type !== 'admin') {
            $query = $query->where('user_id', auth()->user()->id);
        }


        if ($search_query = request()->search_query) {
            $query->where(fn(Builder $query) => $query
                ->where('title', 'like', "%$search_query%")
                ->orWhere('description', 'like', "%$search_query%")
                ->orWhereRelation('lands', 'title', 'like', "%$search_query%")
                ->orWhereRelation('lands', 'title', 'like', "%$search_query%")
                ->orWhereRelation('lands', 'description', 'like', "%$search_query%")
                ->orWhereRelation('lands.bookings.user', 'first_name', 'like', "%$search_query%")
                ->orWhereRelation('lands.bookings.user', 'last_name', 'like', "%$search_query%")
                ->orWhereRelation('lands.bookings.user', 'email', 'like', "%$search_query%")
                ->orWhereRelation('lands.bookings.user', 'phone', 'like', "%$search_query%")
            );
        }
        return $this->json($query->paginatedThroughRequest());
    }


    public function store(StoreProjectRequest $request): JsonResponse
    {
        $data = $request->validationData();
        $data['status'] ??= 'active';
        $data['user_id'] ??= auth()->user()->id;
        $project = Project::create($data);
        return $this->json($project);
    }


    public function show(Project $project): JsonResponse
    {
        return $this->json($project);
    }


    public function update(UpdateProjectRequest $request, Project $project): JsonResponse
    {
        $project->update($request->validationData());
        return $this->json($project);
    }


    public function destroy(Project $project): JsonResponse
    {
        $project->delete();
        return $this->json($project);
    }
}
