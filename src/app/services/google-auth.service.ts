import { Injectable } from '@angular/core';

declare global {
  interface Window {
    google?: any;
  }
}

export interface GoogleProfile {
  name?: string;
  email?: string;
  picture?: string;
  token: string;
  raw: any;
}

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private readonly clientId = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
  private loaderPromise?: Promise<void>;

  private ensureLoaded(): Promise<void> {
    if (this.loaderPromise) return this.loaderPromise;
    this.loaderPromise = new Promise<void>((resolve) => {
      const check = () => {
        if (window.google && window.google.accounts?.oauth2) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
    return this.loaderPromise;
  }

  async signIn(): Promise<GoogleProfile | null> {
    await this.ensureLoaded();
    if (!window.google?.accounts?.oauth2) {
      console.error('Google OAuth SDK not available');
      return null;
    }

    return new Promise<GoogleProfile | null>((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: 'openid profile email',
        prompt: 'select_account',
        callback: async (tokenResponse: any) => {
          try {
            if (!tokenResponse.access_token) {
              resolve(null);
              return;
            }
            const profile = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: {
                Authorization: `Bearer ${tokenResponse.access_token}`,
              },
            }).then(res => res.json());

            resolve({
              name: profile.name,
              email: profile.email,
              picture: profile.picture,
              token: tokenResponse.access_token,
              raw: profile
            });
          } catch (error) {
            reject(error);
          }
        }
      });

      client.requestAccessToken();
    });
  }
}
