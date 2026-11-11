<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountSongbook;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class AccountSongbookController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $songbooks = AccountSongbook::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('book_updated_at')
            ->get()
            ->map(fn (AccountSongbook $book): array => $this->songbookData($book));

        return response()->json(['songbooks' => $songbooks])->header('Cache-Control', 'no-store');
    }

    public function store(Request $request, string $bookId): JsonResponse
    {
        $id = $this->validatedId($bookId);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'createdAt' => ['required', 'integer', 'min:0'],
            'updatedAt' => ['required', 'integer', 'min:0'],
            'songs' => ['present', 'array', 'max:2000'],
            'songs.*' => ['required', 'array'],
            'songs.*.id' => ['required', 'string', 'max:100'],
            'songs.*.title' => ['required', 'string', 'max:200'],
            'songs.*.lyrics' => ['required', 'string', 'max:200000'],
            'songs.*.number' => ['nullable', 'string', 'max:80'],
            'songs.*.author' => ['nullable', 'string', 'max:200'],
            'songs.*.copyright' => ['nullable', 'string', 'max:300'],
            'songs.*.createdAt' => ['required', 'integer', 'min:0'],
            'songs.*.updatedAt' => ['required', 'integer', 'min:0'],
            'songs.*.style' => ['nullable', 'array'],
        ]);

        if (strlen(json_encode($validated['songs'], JSON_THROW_ON_ERROR)) > 2_000_000) {
            return response()->json(['message' => 'This songbook is too large to sync.'], 413);
        }

        $book = AccountSongbook::query()
            ->where('user_id', $request->user()->id)
            ->where('book_id', $id)
            ->first();

        if ($book && $book->book_updated_at > (int) $validated['updatedAt']) {
            return response()->json(['songbook' => $this->songbookData($book)])->header('Cache-Control', 'no-store');
        }

        $book ??= new AccountSongbook;
        $book->fill([
            'name' => $validated['name'],
            'songs' => $validated['songs'],
            'book_created_at' => (int) $validated['createdAt'],
            'book_updated_at' => (int) $validated['updatedAt'],
            'is_deleted' => false,
        ]);
        $book->user_id = $request->user()->id;
        $book->book_id = $id;
        $book->save();

        return response()->json(['songbook' => $this->songbookData($book)])->header('Cache-Control', 'no-store');
    }

    public function destroy(Request $request, string $bookId): JsonResponse
    {
        $id = $this->validatedId($bookId);
        AccountSongbook::query()->where('user_id', $request->user()->id)->where('book_id', $id)->update([
            'is_deleted' => true,
            'songs' => [],
            'book_updated_at' => (int) floor(microtime(true) * 1000),
            'updated_at' => now(),
        ]);

        return response()->json(['message' => 'Songbook removed from account sync.']);
    }

    private function validatedId(string $bookId): string
    {
        return Validator::make(['book_id' => $bookId], [
            'book_id' => ['required', 'string', 'max:100', 'regex:/^[A-Za-z0-9_-]+$/'],
        ])->validate()['book_id'];
    }

    /** @return array{id: string, name: string, createdAt: int, updatedAt: int, songs: array, deleted: bool} */
    private function songbookData(AccountSongbook $book): array
    {
        return [
            'id' => $book->book_id,
            'name' => $book->name,
            'createdAt' => $book->book_created_at,
            'updatedAt' => $book->book_updated_at,
            'songs' => $book->songs ?? [],
            'deleted' => $book->is_deleted,
        ];
    }
}
