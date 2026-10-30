<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $request->merge(['email_address' => strtolower(trim((string) $request->input('email_address', '')))]);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email_address' => ['required', 'string', 'email', 'max:255', 'regex:/^[^@\s]+@gmail\.com$/i', 'unique:users,email'],
            'password' => ['required', 'string', 'min:12', 'max:128'],
            'confirm_password' => ['required', 'string', 'same:password'],
        ], [
            'email_address.regex' => 'Use a Google Gmail address ending in @gmail.com.',
            'confirm_password.same' => 'The password confirmation does not match.',
        ]);

        $user = User::create([
            'name' => trim($validated['name']),
            'email' => $validated['email_address'],
            'password' => $validated['password'],
            'role' => 'Media Team',
        ]);
        $user->sendEmailVerificationNotification();

        return response()->json([
            'verification_required' => true,
            'message' => 'Account created. Check your Gmail inbox for a verification link before signing in.',
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $request->merge(['email_address' => strtolower(trim((string) $request->input('email_address', '')))]);
        $validated = $request->validate([
            'email_address' => ['required', 'string', 'email', 'regex:/^[^@\s]+@gmail\.com$/i'],
            'password' => ['required', 'string'],
        ], [
            'email_address.regex' => 'Use the Gmail address associated with your account.',
        ]);

        $user = User::where('email', $validated['email_address'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email_address' => ['The email or password is incorrect.'],
            ]);
        }

        if (! $user->hasVerifiedEmail()) {
            return response()->json([
                'verification_required' => true,
                'message' => 'Please verify your email address before signing in.',
            ], 403);
        }

        return response()->json([
            'user' => $this->userData($user),
            'token' => $user->createToken('faithstream-desktop')->plainTextToken,
        ])->header('Cache-Control', 'no-store');
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->merge(['email_address' => strtolower(trim((string) $request->input('email_address', '')))]);
        $validated = $request->validate([
            'email_address' => ['required', 'string', 'email', 'max:255', 'regex:/^[^@\s]+@gmail\.com$/i'],
        ], [
            'email_address.regex' => 'Use the Gmail address associated with your account.',
        ]);

        Password::sendResetLink(['email' => $validated['email_address']]);

        // Return the same response whether or not the address has an account.
        return response()->json([
            'message' => 'If an account exists for that Gmail address, a password reset link has been sent.',
        ]);
    }

    public function resendVerification(Request $request): JsonResponse
    {
        $request->merge(['email_address' => strtolower(trim((string) $request->input('email_address', '')))]);
        $validated = $request->validate([
            'email_address' => ['required', 'string', 'email', 'max:255', 'regex:/^[^@\s]+@gmail\.com$/i'],
        ], [
            'email_address.regex' => 'Use the Gmail address associated with your account.',
        ]);

        $user = User::where('email', $validated['email_address'])->first();
        if ($user && ! $user->hasVerifiedEmail()) {
            $user->sendEmailVerificationNotification();
        }

        return response()->json([
            'message' => 'If that Gmail address has an unverified account, a new verification link has been sent.',
        ]);
    }

    public function user(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userData($request->user())]);
    }

    public function updateUser(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'role' => ['required', 'string', 'max:255'],
        ]);
        $user = $request->user();
        $user->name = trim($validated['name']);
        $user->role = trim($validated['role']);
        $user->save();

        return response()->json(['user' => $this->userData($user)]);
    }

    public function storeProfilePhoto(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ]);

        $user = $request->user();
        $previousPath = $user->profile_photo_path;
        $photoPath = $validated['photo']->store('profile-photos/'.$user->id, 'public');

        if (! $photoPath) {
            return response()->json(['message' => 'Could not save the profile photo. Please try again.'], 500);
        }

        $user->profile_photo_path = $photoPath;
        $user->profile_photo_x = 50;
        $user->profile_photo_y = 50;
        $user->save();

        if ($previousPath && $previousPath !== $photoPath) {
            Storage::disk('public')->delete($previousPath);
        }

        return response()->json(['user' => $this->userData($user)]);
    }

    public function deleteProfilePhoto(Request $request): JsonResponse
    {
        $user = $request->user();
        $previousPath = $user->profile_photo_path;
        $user->profile_photo_path = null;
        $user->profile_photo_x = 50;
        $user->profile_photo_y = 50;
        $user->save();

        if ($previousPath) {
            Storage::disk('public')->delete($previousPath);
        }

        return response()->json(['user' => $this->userData($user)]);
    }

    public function updateProfilePhotoPosition(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'x' => ['required', 'integer', 'between:0,100'],
            'y' => ['required', 'integer', 'between:0,100'],
        ]);

        $user = $request->user();
        if (! $user->profile_photo_path) {
            return response()->json(['message' => 'Add a profile photo before adjusting its position.'], 422);
        }

        $user->profile_photo_x = $validated['x'];
        $user->profile_photo_y = $validated['y'];
        $user->save();

        return response()->json(['user' => $this->userData($user)]);
    }

    public function showProfilePhoto(User $user): StreamedResponse|JsonResponse
    {
        $photoPath = $user->profile_photo_path;
        if (! $photoPath || ! Storage::disk('public')->exists($photoPath)) {
            return response()->json(['message' => 'Profile photo not found.'], 404);
        }

        return Storage::disk('public')->response($photoPath, null, ['Cache-Control' => 'private, max-age=3600']);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Signed out.']);
    }

    /** @return array{id: int, name: string, email_address: string, role: string, profile_photo_url: string|null, profile_photo_position: array{x: int, y: int}} */
    private function userData(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email_address' => $user->email,
            'role' => $user->role,
            'profile_photo_url' => $user->profile_photo_path
                ? URL::temporarySignedRoute('profile-photos.show', now()->addYear(), ['user' => $user->getKey()], absolute: false)
                : null,
            'profile_photo_position' => [
                'x' => (int) $user->profile_photo_x,
                'y' => (int) $user->profile_photo_y,
            ],
        ];
    }
}
