<?php

namespace App\Http\Controllers;

use App\Http\Controllers\base\Controller;
use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Models\Project;
use Illuminate\Http\JsonResponse;

class ProjectController extends Controller
{

    public function __construct()
    {
    }


    public function index(): JsonResponse
    {
//        $key = (new Project)->cashBaseKey();
//        $responseData = cache()->tags([Project::class])->remember($key, 60 * 60, fn() => Project::allThroughRequest());
        $responseData = Project::allThroughRequest()->paginatedThroughRequest();
        return $this->json($responseData);
    }


    public function store(StoreProjectRequest $request): JsonResponse
    {
        $data = $request->validationData();
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
