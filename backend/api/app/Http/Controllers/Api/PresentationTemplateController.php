<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PresentationTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Account sync for the Presentations editor's "My templates". Works like presentation
 * sync: the desktop app keeps templates on the computer and uploads changed ones; the
 * newest version (by the app's updatedAt) wins.
 */
class PresentationTemplateController extends Controller
{
    /** Template ids are UUIDs; templates saved before account sync used short "mine-…" ids. */
    private const ID_RULES = ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9_-]+$/'];

    public function index(Request $request): JsonResponse
    {
        $templates = PresentationTemplate::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('template_updated_at')
            ->get()
            ->map(fn (PresentationTemplate $template): array => $this->templateData($template));

        return response()->json(['templates' => $templates])->header('Cache-Control', 'no-store');
    }

    public function store(Request $request, string $templateId): JsonResponse
    {
        $id = $this->validatedId($templateId);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'slides' => ['required', 'array', 'min:1', 'max:500'],
            'slides.*' => ['required', 'array'],
            'colors' => ['sometimes', 'nullable', 'array', 'max:24'],
            'colors.*' => ['string', 'max:40'],
            'updatedAt' => ['required', 'integer', 'min:0'],
            'hasLocalMedia' => ['sometimes', 'boolean'],
        ]);

        $encodedSlides = json_encode($validated['slides'], JSON_THROW_ON_ERROR);
        if (strlen($encodedSlides) > 2_000_000) {
            return response()->json(['message' => 'This template is too large to sync.'], 413);
        }

        $template = PresentationTemplate::query()
            ->where('user_id', $request->user()->id)
            ->where('template_id', $id)
            ->first();

        // The account already has a newer version (saved from another computer).
        if ($template && $template->template_updated_at > (int) $validated['updatedAt']) {
            return response()->json(['template' => $this->templateData($template)]);
        }

        $template ??= new PresentationTemplate;
        $template->fill([
            'name' => $validated['name'],
            'slides' => $validated['slides'],
            'colors' => $validated['colors'] ?? null,
            'has_local_media' => (bool) ($validated['hasLocalMedia'] ?? false),
            'template_updated_at' => (int) $validated['updatedAt'],
        ]);
        $template->user_id = $request->user()->id;
        $template->template_id = $id;
        $template->save();

        return response()->json(['template' => $this->templateData($template)])->header('Cache-Control', 'no-store');
    }

    public function destroy(Request $request, string $templateId): JsonResponse
    {
        $id = $this->validatedId($templateId);

        PresentationTemplate::query()
            ->where('user_id', $request->user()->id)
            ->where('template_id', $id)
            ->delete();

        return response()->json(['message' => 'Template removed from your account.']);
    }

    private function validatedId(string $templateId): string
    {
        return Validator::make(['template_id' => $templateId], [
            'template_id' => self::ID_RULES,
        ])->validate()['template_id'];
    }

    /** @return array{id: string, name: string, slides: array, colors: array|null, updatedAt: int, hasLocalMedia: bool} */
    private function templateData(PresentationTemplate $template): array
    {
        return [
            'id' => $template->template_id,
            'name' => $template->name,
            'slides' => $template->slides,
            'colors' => $template->colors,
            'updatedAt' => $template->template_updated_at,
            'hasLocalMedia' => $template->has_local_media,
        ];
    }
}
