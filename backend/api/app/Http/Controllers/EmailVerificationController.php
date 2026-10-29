<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;

class EmailVerificationController extends Controller
{
    public function verify(Request $request, string $id, string $hash)
    {
        $user = User::findOrFail($id);

        abort_unless(hash_equals(sha1($user->getEmailForVerification()), $hash), 403);

        $alreadyVerified = $user->hasVerifiedEmail();
        if (! $alreadyVerified) {
            $user->markEmailAsVerified();
        }

        return view('email-verified', ['alreadyVerified' => $alreadyVerified]);
    }
}
