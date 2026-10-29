<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PresentationProject;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class PresentationProjectController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $projects = PresentationProject::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('project_updated_at')
            ->get()
            ->map(fn (PresentationProject $project): array => $this->projectData($project));

        return response()->json(['presentations' => $projects])->header('Cache-Control', 'no-store');
    }

    public function store(Request $request, string $projectId): JsonResponse
    {
        $id = Validator::make(['project_id' => $projectId], [
            'project_id' => ['required', 'uuid'],
        ])->validate()['project_id'];

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'slides' => ['required', 'array', 'max:500'],
            'slides.*' => ['required', 'array'],
            'updatedAt' => ['required', 'integer', 'min:0'],
            'hasLocalMedia' => ['sometimes', 'boolean'],
        ]);

        $encodedSlides = json_encode($validated['slides'], JSON_THROW_ON_ERROR);
        if (strlen($encodedSlides) > 2_000_000) {
            return response()->json(['message' => 'This presentation is too large to sync.'], 413);
        }

        $project = PresentationProject::query()
            ->where('user_id', $request->user()->id)
            ->where('project_id', $id)
            ->first();

        if ($project && $project->project_updated_at > (int) $validated['updatedAt']) {
            return response()->json(['presentation' => $this->projectData($project)]);
        }

        $project ??= new PresentationProject([
            'user_id' => $request->user()->id,
            'project_id' => $id,
        ]);
        $project->fill([
            'name' => $validated['name'],
            'slides' => $validated['slides'],
            'has_local_media' => (bool) ($validated['hasLocalMedia'] ?? false),
            'project_updated_at' => (int) $validated['updatedAt'],
        ]);
        $project->user_id = $request->user()->id;
        $project->project_id = $id;
        $project->save();

        return response()->json(['presentation' => $this->projectData($project)], 200)->header('Cache-Control', 'no-store');
    }

    public function destroy(Request $request, string $projectId): JsonResponse
    {
        $id = Validator::make(['project_id' => $projectId], [
            'project_id' => ['required', 'uuid'],
        ])->validate()['project_id'];

        PresentationProject::query()
            ->where('user_id', $request->user()->id)
            ->where('project_id', $id)
            ->delete();

        return response()->json(['message' => 'Presentation removed from account sync.']);
    }

    /** @return array{id: string, name: string, slides: array, updatedAt: int, hasLocalMedia: bool} */
    private function projectData(PresentationProject $project): array
    {
        return [
            'id' => $project->project_id,
            'name' => $project->name,
            'slides' => $project->slides,
            'updatedAt' => $project->project_updated_at,
            'hasLocalMedia' => $project->has_local_media,
        ];
    }
}
