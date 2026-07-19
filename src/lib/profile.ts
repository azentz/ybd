export type StoredProfile = {
  name: string
  updatedAt: string
}

export const PROFILE_STORAGE_KEY = 'ybd.profile.v1'

export function loadProfile(): StoredProfile | null {
  const raw = localStorage.getItem(PROFILE_STORAGE_KEY)

  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StoredProfile

    if (typeof parsed.name !== 'string' || typeof parsed.updatedAt !== 'string') {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function saveProfile(profile: StoredProfile): void {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
}

export function clearProfile(): void {
  localStorage.removeItem(PROFILE_STORAGE_KEY)
}
