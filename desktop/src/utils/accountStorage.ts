const USER_PROFILE_KEY = 'faithstream.user-profile';

/** Build private local storage namespaces from the authenticated account profile. */
export const getAccountStorageKey = (key: string): string => {
  let email = '';

  try {
    const profile = JSON.parse(localStorage.getItem(USER_PROFILE_KEY) ?? 'null') as { email?: unknown } | null;
    if (typeof profile?.email === 'string') email = profile.email.trim().toLocaleLowerCase();
  } catch {
    // Use an isolated fallback namespace when a profile is unavailable.
  }

  const account = email ? encodeURIComponent(email) : 'unassigned';
  return `${key}:account:${account}`;
};

export const getAccountDatabaseName = (name: string): string => getAccountStorageKey(name);
