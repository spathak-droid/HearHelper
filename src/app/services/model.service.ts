import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { AuthService, SignInResponse } from './auth.service';

export type VoiceModelSample = {
  format: string;
  text: string;
  data: string;
};

export type VoiceModel = {
  id: string;
  common_name?: string;
  sample?: VoiceModelSample;
};

type ModelsResponse = {
  models: VoiceModel[];
  count?: number;
};

const FRIENDLY_NAMES: Record<string, string> = {
  'en_US-bryce-medium': 'Bryce',
  'en_US-byrce-medium': 'Bryce',
  'en_US-danny-medium': 'Danny',
  'en_US-joe-medium': 'Joe',
  'en_US-kathleen-medium': 'Kathleen'
};

@Injectable({
  providedIn: 'root'
})
export class ModelService {
  private readonly endpoint = 'http://127.0.0.1:8000/auth/models/';
  private readonly voiceEndpoint = 'http://127.0.0.1:8000/auth/voice/';

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService
  ) {}

  fetchModels(): Observable<VoiceModel[]> {
    const session = this.requireSession();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${session.token}`
    });
    return this.http
      .get<ModelsResponse>(this.endpoint, { headers })
      .pipe(
        map((response) =>
          (response.models ?? []).map((model) => ({
            ...model,
            common_name: model.common_name || FRIENDLY_NAMES[model.id]
          }))
        )
      );
  }

  private requireSession(): SignInResponse {
    const session = this.auth.getSessionSnapshot();
    if (!session) {
      throw new Error('You must be signed in to load models.');
    }
    return session;
  }

  setVoice(voiceId: string) {
    const session = this.requireSession();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${session.token}`
    });
    return this.http.post(
      this.voiceEndpoint,
      { voice: voiceId },
      { headers }
    );
  }
}
