import { Injectable, Inject, PLATFORM_ID, OnDestroy, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';

export type SignInCredentials = {
  email: string;
  password: string;
};

export type SignUpPayload = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
};

export type AuthUser = {
  first_name: string;
  last_name: string;
  email: string;
  voice?: string;
  voice_common_name?: string;
  profile_photo_url?: string;
  role?: string;
};

export type SignInResponse = {
  message: string;
  token: string;
  user: AuthUser;
};

export type PhotoUploadResponse = {
  upload_url: string;
  download_url: string;
  object_key: string;
  content_type: string;
  expires_in: number;
};

@Injectable({
  providedIn: 'root'
})
export class AuthService implements OnDestroy {
  private readonly endpoint = 'http://127.0.0.1:8000/auth/signin/';
  private readonly signUpEndpoint = 'http://127.0.0.1:8000/auth/signup/';
  private readonly photoEndpoint = 'http://127.0.0.1:8000/auth/profile/photo-url/';
  private readonly storageKey = 'hearhelper-session';
  private readonly sessionState = signal<SignInResponse | null>(null);
  private readonly isBrowser: boolean;
  private readonly storageListener = (event: StorageEvent) => {
    if (event.key !== this.storageKey) {
      return;
    }
    if (event.newValue) {
      try {
        const parsed: SignInResponse = JSON.parse(event.newValue);
        this.sessionState.set(parsed);
      } catch (err) {
        console.warn('Unable to parse stored session payload', err);
      }
    } else {
      this.sessionState.set(null);
    }
  };

  readonly session = this.sessionState.asReadonly();

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.restoreSession();

    if (this.isBrowser && typeof window !== 'undefined') {
      window.addEventListener('storage', this.storageListener);
    }
  }

  signIn(credentials: SignInCredentials): Observable<SignInResponse> {
    return this.http
      .post<SignInResponse | { error?: string; message?: string }>(this.endpoint, credentials)
      .pipe(
        mergeMap((response) => {
          if (response && typeof (response as SignInResponse).token === 'string') {
            const typed = response as SignInResponse;
            this.persistSession(typed);
            return of(typed);
          }
          const fallback =
            (response as { error?: string; message?: string })?.error ||
            (response as { message?: string }).message ||
            'Invalid credentials. Please try again.';
          return throwError(() => new Error(fallback));
        }),
        catchError((error) => {
          const serverMessage =
            (error?.error?.error as string) ||
            (error?.error?.message as string) ||
            error?.message ||
            'Invalid credentials. Please try again.';
          return throwError(() => new Error(serverMessage));
        })
      );
  }

  signUp(payload: SignUpPayload): Observable<SignInResponse> {
    return this.http.post<SignInResponse>(this.signUpEndpoint, payload);
  }

  updateVoice(voice: string, voiceName?: string) {
    const current = this.sessionState();
    if (!current) {
      return;
    }
    const updated: SignInResponse = {
      ...current,
      user: {
        ...current.user,
        voice,
        voice_common_name: voiceName
      }
    };
    this.persistSession(updated);
  }

  updateAvatar(avatarUrl: string) {
    const current = this.sessionState();
    if (!current) {
      return;
    }
    const updated: SignInResponse = {
      ...current,
      user: {
        ...current.user,
        profile_photo_url: avatarUrl
      }
    };
    this.persistSession(updated);
  }

  requestPhotoUpload(extension: string): Observable<PhotoUploadResponse> {
    const session = this.getSessionOrThrow();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${session.token}`
    });
    return this.http.post<PhotoUploadResponse>(this.photoEndpoint, { extension }, { headers });
  }

  clearSession() {
    this.sessionState.set(null);
    if (!this.isBrowser || typeof window === 'undefined') {
      return;
    }
    try {
      window.sessionStorage.removeItem(this.storageKey);
    } catch (err) {
      console.warn('Failed to clear auth session', err);
    }
  }

  getSessionSnapshot(): SignInResponse | null {
    return this.sessionState();
  }

  ngOnDestroy() {
    if (this.isBrowser && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageListener);
    }
  }

  private persistSession(session: SignInResponse) {
    this.sessionState.set(session);
    if (!this.isBrowser || typeof window === 'undefined') {
      return;
    }
    try {
      window.sessionStorage.setItem(this.storageKey, JSON.stringify(session));
    } catch (err) {
      console.warn('Failed to persist auth session', err);
    }
  }

  private restoreSession() {
    if (!this.isBrowser || typeof window === 'undefined') {
      return;
    }
    try {
      const stored = window.sessionStorage.getItem(this.storageKey);
      if (!stored) {
        return;
      }
      const parsed: SignInResponse = JSON.parse(stored);
      this.sessionState.set(parsed);
    } catch (err) {
      console.warn('Failed to restore auth session', err);
    }
  }

  private getSessionOrThrow(): SignInResponse {
    const session = this.sessionState();
    if (!session) {
      throw new Error('Not authenticated');
    }
    return session;
  }
}
