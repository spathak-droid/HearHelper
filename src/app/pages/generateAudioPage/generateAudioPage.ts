import { Component, inject, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ModelService, VoiceModel } from '../../services/model.service';
import { firstValueFrom } from 'rxjs';
import { PLATFORM_ID } from '@angular/core';

@Component({
  selector: 'generate-audio-page',
  standalone: true,
  templateUrl: './generateAudioPage.html',
  styleUrls: ['./generateAudioPage.css'],
  imports: [CommonModule, FormsModule, RouterLink]
})
export class GenerateAudioPage implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly modelService = inject(ModelService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly session = this.auth.session;

  text = '';
  wordCount = 0;
  limitError = '';
  statusMessage = '';
  models: VoiceModel[] = [];
  availableModels: VoiceModel[] = [];
  selectedModelId = '';
  modelError = '';
  isLoadingModels = false;
  needsPaymentForWords = false;
  needsPaymentForModel = false;
  audioPreviewUrl: string | null = null;
  isGeneratingAudio = false;
  private socket: WebSocket | null = null;
  private pendingRequests: Array<{ type: 'generate'; text: string; voice?: string; message_id: string }> = [];
  private currentAudioObjectUrl: string | null = null;
  readonly freeVoices = new Set(['en_US-amy-medium', 'en_US-arctic-medium']);

  constructor() {
    if (this.session()) {
      this.loadModels();
    }
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.ensureSocket(), 0);
    }
  }

  get isAdmin(): boolean {
    const role = this.session()?.user?.role;
    return role?.toLowerCase() === 'admin';
  }

  get hasPaidVoice(): boolean {
    const current = this.session()?.user?.voice;
    if (!current) {
      return false;
    }
    return !this.freeVoices.has(current);
  }

  get wordLimit(): number {
    if (this.isAdmin) {
      return 500;
    }
    if (this.hasPaidVoice) {
      return 100;
    }
    return 50;
  }

  get upgradeHint(): string {
    if (this.isAdmin) {
      return 'Admins can render up to 500 words per request.';
    }
    if (this.hasPaidVoice) {
      return 'Lifetime Pass lets you generate up to 100 words. Longer passages require admin access.';
    }
    return 'Free accounts support up to 50 words. Upgrade to push beyond that limit.';
  }

  onTextChange(value: string) {
    this.text = value;
    this.wordCount = this.countWords(value);
    this.evaluateLimit();
    this.statusMessage = '';
  }

  selectModel(modelId: string) {
    this.selectedModelId = modelId;
    if (!this.isModelAllowed(modelId)) {
      this.limitError = 'Upgrade to unlock this voice model.';
      this.needsPaymentForModel = true;
      return;
    }
    this.needsPaymentForModel = false;
    this.statusMessage = '';
    this.limitError = '';
  }

  async generateAudio() {
    this.statusMessage = '';
    if (!this.session()) {
      this.limitError = 'Sign in to generate audio.';
      return;
    }
    this.evaluateLimit();
    if (this.limitError) {
      return;
    }
    if (!this.text.trim()) {
      this.limitError = 'Enter some text to generate audio.';
      return;
    }
    if (!this.selectedModelId) {
      this.limitError = 'Select a voice model to continue.';
      return;
    }
    if (!this.isModelAllowed(this.selectedModelId)) {
      this.limitError = 'Upgrade to unlock this voice model.';
      this.needsPaymentForModel = true;
      return;
    }
    this.limitError = '';
    this.needsPaymentForWords = false;
    this.needsPaymentForModel = false;
    this.statusMessage = 'Generating preview…';
    this.isGeneratingAudio = true;
    if (this.currentAudioObjectUrl) {
      URL.revokeObjectURL(this.currentAudioObjectUrl);
      this.currentAudioObjectUrl = null;
    }
    this.audioPreviewUrl = null;
    this.sendTTSRequest(this.text.trim());
  }

  get currentModelName(): string {
    const selected = this.availableModels.find((model) => model.id === this.selectedModelId);
    return selected?.common_name || selected?.id || 'your voice';
  }

  private async loadModels() {
    this.isLoadingModels = true;
    this.modelError = '';
    try {
      this.models = await firstValueFrom(this.modelService.fetchModels());
      this.availableModels = this.models;
      if (!this.selectedModelId) {
        const preferred = this.session()?.user?.voice;
        if (preferred && this.models.some((m) => m.id === preferred)) {
          this.selectedModelId = preferred;
        } else {
          const firstAllowed = this.models.find((m) => this.isModelAllowed(m.id));
          this.selectedModelId = firstAllowed?.id || this.models[0]?.id || '';
        }
      }
    } catch (error) {
      console.error('Failed to load models', error);
      this.modelError = this.extractModelError(error);
    } finally {
      this.isLoadingModels = false;
      this.cdr.detectChanges();
    }
  }

  isModelAllowed(modelId: string): boolean {
    if (this.isAdmin) {
      return true;
    }
    const allowed = new Set(Array.from(this.freeVoices));
    const current = this.session()?.user?.voice;
    if (current) {
      allowed.add(current);
    }
    return allowed.has(modelId);
  }

  goToPayment() {
    this.router.navigate(['/payment']).catch((error) => console.error('Failed to navigate to payment', error));
  }

  signOut() {
    this.auth.clearSession();
    this.text = '';
    this.wordCount = 0;
    this.limitError = '';
    this.statusMessage = '';
    this.models = [];
    this.availableModels = [];
    this.selectedModelId = '';
    this.audioPreviewUrl = null;
    this.needsPaymentForWords = false;
    this.needsPaymentForModel = false;
    this.pendingRequests = [];
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.router.navigate(['/signin']).catch((error) => console.error('Failed to navigate to signin', error));
  }

  ngOnDestroy() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    if (this.currentAudioObjectUrl) {
      URL.revokeObjectURL(this.currentAudioObjectUrl);
      this.currentAudioObjectUrl = null;
    }
  }

  private ensureSocket() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const token = this.session()?.token ?? null;
    const baseUrl = 'ws://localhost:8000/ws/hat/';
    const url = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
    this.socket = new WebSocket(url);
    this.socket.onopen = () => this.flushPendingRequests();
    this.socket.onmessage = (event) => this.handleSocketMessage(event.data);
    this.socket.onerror = () => {
      this.isGeneratingAudio = false;
      this.statusMessage = 'Unable to connect to audio service.';
      this.cdr.detectChanges();
    };
    this.socket.onclose = () => {
      this.socket = null;
    };
  }

  private sendTTSRequest(text: string) {
    const payload = {
      type: 'generate' as const,
      text,
      voice: this.selectedModelId || undefined,
      message_id: `ga-${Date.now()}`
    };
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    } else {
      this.pendingRequests.push(payload);
      this.ensureSocket();
    }
  }

  private flushPendingRequests() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    while (this.pendingRequests.length) {
      const payload = this.pendingRequests.shift();
      if (payload) {
        this.socket.send(JSON.stringify(payload));
      }
    }
  }

  private handleSocketMessage(rawData: string) {
    let data: any;
    try {
      data = JSON.parse(rawData);
    } catch {
      return;
    }
    if (data.type !== 'tts_result' && data.type !== 'book_playback') {
      return;
    }
    if (data.audio) {
      this.applyAudioPayload(data.audio, data.format || 'mp3');
      this.statusMessage = 'Preview ready. Tap play to listen.';
    } else {
      this.statusMessage = 'Audio response received without data.';
    }
    this.isGeneratingAudio = false;
    this.cdr.detectChanges();
  }

  private applyAudioPayload(base64Audio: string, format: string) {
    try {
      const sanitized = base64Audio.replace(/\s+/g, '');
      const binaryString = atob(sanitized);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: `audio/${format}` });
      if (this.currentAudioObjectUrl) {
        URL.revokeObjectURL(this.currentAudioObjectUrl);
      }
      const objectUrl = URL.createObjectURL(blob);
      this.audioPreviewUrl = objectUrl;
      this.currentAudioObjectUrl = objectUrl;
    } catch (error) {
      console.error('Failed to decode audio payload', error);
      this.statusMessage = 'Unable to decode preview.';
    }
  }

  private evaluateLimit() {
    if (this.wordCount > this.wordLimit) {
      const nextTier =
        this.isAdmin || this.hasPaidVoice
          ? 'Admins can generate up to 500 words.'
          : 'Upgrade to a Lifetime Pass to generate up to 100 words.';
      this.limitError = `Word limit exceeded (${this.wordCount}/${this.wordLimit}). ${nextTier}`;
      this.needsPaymentForWords = !this.isAdmin;
    } else if (this.wordCount > 100 && !(this.isAdmin || this.hasPaidVoice)) {
      this.limitError = 'More than 100 words requires paid access.';
      this.needsPaymentForWords = true;
    } else {
      this.limitError = '';
      this.needsPaymentForWords = false;
    }
  }

  private countWords(value: string): number {
    return value
      .trim()
      .split(/\s+/)
      .filter((word) => word.length)
      .length;
  }

  private extractModelError(error: unknown): string {
    if (!error) return 'Unable to load models.';
    if (typeof error === 'string') return error;
    const httpError = error as { error?: unknown; message?: string; statusText?: string };
    if (httpError.error) {
      if (typeof httpError.error === 'string') return httpError.error;
      if (typeof httpError.error === 'object' && httpError.error) {
        const { detail, message } = httpError.error as { detail?: string; message?: string };
        return message || detail || 'Unable to load models.';
      }
    }
    return httpError.message || httpError.statusText || 'Unable to load models.';
  }
}
