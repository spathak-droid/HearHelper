import { Injectable, Inject, PLATFORM_ID, OnDestroy, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export type SignInCredentials = {
  email: string;
  password: string;
};

export type AuthUser = {
  first_name: string;
  last_name: string;
  email: string;
};

export type SignInResponse = {
  message: string;
  token: string;
  user: AuthUser;
};

@Injectable({
  providedIn: 'root'
})
export class AuthService implements OnDestroy {
  private readonly endpoint = 'http://127.0.0.1:8000/auth/signin/';
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
      .post<SignInResponse>(this.endpoint, credentials)
      .pipe(tap((response) => this.persistSession(response)));
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
}
