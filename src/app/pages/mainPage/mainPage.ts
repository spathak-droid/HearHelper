import { Component, inject, PLATFORM_ID, AfterViewInit, OnDestroy, ChangeDetectorRef, ElementRef, ViewChild, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ModelService, VoiceModel } from '../../services/model.service';
import { firstValueFrom } from 'rxjs';

declare var webkitSpeechRecognition: any;

declare var webkitSpeechRecognition: any;

type ChatMessage = {
  id: string;
  from: 'user' | 'bot';
  text: string;
  chunk?: number;
  totalChunks?: number;
  type?: string;
  displayText?: string;
  isTyping?: boolean;
};

type ClientInfo = {
  os: string;
  browser: string;
  userAgent: string;
};

@Component({
  selector: 'main-page',
  standalone: true,
  templateUrl: './mainPage.html',
  styleUrls: ['./mainPage.css'],
  imports: [CommonModule]
})
export class MainPage implements AfterViewInit, OnDestroy {

  private platformId = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly modelService = inject(ModelService);
  private socket: WebSocket | null = null;
  private currentSocketToken: string | null = null;
  private hasInitializedSocket = false;
  private pendingSessionToken: string | null = null;
  private botAudio?: HTMLAudioElement;
  private currentAudioUrl?: string;
  @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;
  private listenTimeoutId?: number;
  private longPressTimeoutId?: number;
  private longPressTriggered = false;
  private readonly longPressDuration = 2000;

  isListening = false;
  isBotTalking = false;
  isPressing = false;
  isAudioPaused = false;
  hasActiveAudio = false;
  isSigninDialogOpen = false;
  showScrollToLatest = false;
  private mediaStream?: MediaStream;
  private clientInfo?: ClientInfo;
  private readonly clientInfoStorageKey = 'hearhelper-client-info';
  messages: ChatMessage[] = [];
  activeMessageId: string | null = null;
  private activeBotMessage?: ChatMessage;
  private pendingTTSRequests: Array<{ type: 'tts'; text: string; message_id: string }> = [];
  private messageCounter = 0;
  private typingTimers = new Map<string, number>();
  private readonly typingSpeed = 25;
  models: VoiceModel[] = [];
  isModelPanelOpen = false;
  isModelLoading = false;
  modelError = '';
  private sampleAudio?: HTMLAudioElement;
  playingModelId: string | null = null;
  protected readonly session = this.auth.session;
  private readonly freeVoices = new Set<string>(['en_US-amy-medium', 'en_US-arctic-medium']);
  pendingVoiceModel?: VoiceModel;
  isVoiceConfirmOpen = false;
  isVoiceUpdating = false;
  voiceUpdateError = '';
  voiceUpdateSuccess = '';
  private bookAdvanceTracker = new Map<string, number>();
  private pendingBookAdvance: { id: string; chunk: number; total: number } | null = null;

  recognition: any;
  transcript: string = '';

  private get activeVoiceId(): string | undefined {
    return this.pendingVoiceModel?.id || this.session()?.user?.voice;
  }

  get currentVoiceName(): string {
    const voiceName =
      this.session()?.user?.voice_common_name ||
      this.pendingVoiceModel?.common_name ||
      this.session()?.user?.voice;
    return voiceName || 'Default';
  }

  get isAdmin(): boolean {
    const role = this.session()?.user?.role;
    return role?.toLowerCase() === 'admin';
  }

  isActiveVoice(model: VoiceModel): boolean {
    return !!this.activeVoiceId && model.id === this.activeVoiceId;
  }

  isVoiceFree(model: VoiceModel): boolean {
    if (this.isAdmin) {
      return true;
    }
    const currentPaidVoice = this.session()?.user?.voice;
    return this.freeVoices.has(model.id) || model.id === currentPaidVoice;
  }

  constructor() {
    // DO NOT init speech here — SSR/hydration conflict.
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) {
        return;
      }
      const token = this.session()?.token ?? null;
      this.pendingSessionToken = token;
      if (!this.hasInitializedSocket) {
        return;
      }
      if (token === this.currentSocketToken) {
        return;
      }
      this.reconnectWebSocket(token);
    });
  }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeClientInfo();
      // Initialize WebSocket connection
      this.hasInitializedSocket = true;
      const token = this.pendingSessionToken ?? this.session()?.token ?? null;
      this.connectWebSocket(token);
      
      // Wait for hydration to finish completely
      setTimeout(() => {
        this.setupSpeechRecognition();
      }, 200);
    }
  }

  ngOnDestroy() {
    // Close WebSocket connection when component is destroyed
    this.cleanupWebSocket();

    if (this.botAudio) {
      this.resetBotAudioState();
    }

    if (this.listenTimeoutId) {
      clearTimeout(this.listenTimeoutId);
      this.listenTimeoutId = undefined;
    }
    if (this.longPressTimeoutId) {
      clearTimeout(this.longPressTimeoutId);
      this.longPressTimeoutId = undefined;
    }
    this.clearAllTypingTimers();
    this.stopSamplePlayback();
  }

  private connectWebSocket(token: string | null) {
    this.cleanupWebSocket();
    const baseUrl = 'ws://localhost:8000/ws/hat/';
    const url = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
    this.socket = new WebSocket(url);
    this.currentSocketToken = token;

    this.socket.onopen = () => {
      console.log('Connected to WebSocket', token ? 'with token' : 'without token');
      this.flushPendingTTSRequests();
    };

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'tts_result' || data.type === 'book_playback') {
        console.log('Received audio data', data);
        const responseLog =
          data.response_text ||
          data.response ||
          data.text ||
          (data.type === 'book_playback'
            ? `Playing book chunk ${data.book?.chunk ?? '?'}`
            : 'Bot response is playing.');
        const botMessageId = data.message_id || this.createMessageId('bot');
        const botMessage: ChatMessage = {
          id: botMessageId,
          from: 'bot',
          text: responseLog,
          chunk: data.book?.chunk ?? data.book?.chunk_index,
          totalChunks: data.book?.total_chunks ?? data.book?.totalChunks,
          type: data.type,
          displayText: '',
          isTyping: true
        };
        this.messages.push(botMessage);
        this.startTypingEffect(botMessage);
        this.handleBookAutoAdvance(data, !!data.audio);
        this.scrollToBottom();
        // Handle potential large base64 payloads safely
        if (data.audio) {
          this.setActiveMessage(botMessage);
          this.playBase64Audio(data.audio, data.format || 'mp3');
        } else {
          console.warn('Received response without audio data.');
        }
      } else if (data.type === 'error') {
        console.error('Error:', data.error, data.details);
        if (this.shouldPromptSignIn(data)) {
          this.openSigninDialog();
        }
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.socket.onclose = () => {
      console.log('WebSocket connection closed');
      this.socket = null;
      this.currentSocketToken = null;
    };
  }

  private reconnectWebSocket(token: string | null) {
    this.connectWebSocket(token);
  }

  private cleanupWebSocket() {
    if (this.socket) {
      try {
        this.socket.onopen = null;
        this.socket.onclose = null;
        this.socket.onmessage = null;
        this.socket.onerror = null;
        this.socket.close();
      } catch (err) {
        console.warn('Error closing WebSocket', err);
      }
    }
    this.socket = null;
    this.currentSocketToken = null;
    this.bookAdvanceTracker.clear();
    this.pendingBookAdvance = null;
  }

  private sendTTSRequest(text: string) {
    const payload = {
      type: 'tts' as const,
      text,
      message_id: 'msg-' + Date.now(),
      client: this.clientInfo
    };

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
      console.log('Sent TTS request', payload);
    } else {
      console.warn('WebSocket is not connected, queueing request');
      this.pendingTTSRequests.push(payload);
    }
  }

  private flushPendingTTSRequests() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    while (this.pendingTTSRequests.length) {
      const payload = this.pendingTTSRequests.shift();
      if (!payload) {
        continue;
      }
      this.socket.send(JSON.stringify(payload));
      console.log('Sent queued TTS request', payload);
    }
  }

  private playBase64Audio(base64Audio: string, format: string) {
    try {
      const sanitized = base64Audio.replace(/\s+/g, '');
      const binaryString = atob(sanitized);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: `audio/${format}` });
      const objectUrl = URL.createObjectURL(blob);
      this.playBotAudio(objectUrl, true);
    } catch (error) {
      console.error('Failed to decode audio base64 payload', error);
      this.resetBotAudioState();
    }
  }

  private playBotAudio(src: string, isObjectUrl = false) {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.botAudio) {
      this.botAudio.pause();
      this.botAudio = undefined;
      this.isBotTalking = false;
    }
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = undefined;
    }

    const audio = new Audio(src);
    if (isObjectUrl) {
      this.currentAudioUrl = src;
    }
    this.botAudio = audio;
    this.isBotTalking = true;
    this.hasActiveAudio = true;
    this.isAudioPaused = false;
    this.cdr.detectChanges();

    audio.onended = () => {
      this.flushBookAdvanceRequest();
      this.resetBotAudioState();
    };

    audio.onerror = () => {
      this.resetBotAudioState();
    };

    audio.onpause = () => {
      if (audio.ended) {
        return;
      }
      this.isBotTalking = false;
      this.isAudioPaused = true;
      this.pauseActiveTyping();
      this.cdr.detectChanges();
    };

    audio.onplay = () => {
      this.isBotTalking = true;
      this.isAudioPaused = false;
      this.resumeActiveTyping();
      this.cdr.detectChanges();
    };

    audio.play().catch(() => this.resetBotAudioState());
  }

  private resetBotAudioState() {
    this.isBotTalking = false;
    this.hasActiveAudio = false;
    if (this.botAudio) {
      this.botAudio.pause();
      this.botAudio = undefined;
    }
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = undefined;
    }
    this.isAudioPaused = false;
    this.activeMessageId = null;
    this.activeBotMessage = undefined;
    this.pendingBookAdvance = null;
    this.cdr.detectChanges();
  }

  // ---------------- LISTEN & STOP ----------------

  async startListening() {
  if (!isPlatformBrowser(this.platformId)) return;
  if (!this.recognition) return;
  if (this.isListening) return;

  this.isListening = true;
  this.finalText = '';   // reset final combined text
  this.transcript = '';  // reset what user sees
  this.lastFinalTranscript = '';

  try {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.recognition.start();
  } catch (err) {
    this.isListening = false;
    console.error("Mic error:", err);
  }
}


  stopListening() {
    if (!this.isListening) return;
    this.isListening = false;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = undefined;
    }

    if (this.recognition) {
      this.recognition.stop();
    }
  }

  // ---------------- UI TOUCH EVENTS ----------------

  onPointerDown(event: PointerEvent) {
    event.preventDefault();
    this.isPressing = true;

    if (this.hasActiveAudio && this.botAudio) {
      this.beginAudioLongPressDetection();
      return;
    }

    this.playBeep();
    this.scheduleListeningStart();
  }


  onPointerUp(event: PointerEvent) {
    event.preventDefault();
    this.isPressing = false;
    const hadActiveAudio = this.hasActiveAudio && !!this.botAudio;
    const isActualPointerUp = event.type === 'pointerup';

    if (this.longPressTimeoutId) {
      clearTimeout(this.longPressTimeoutId);
      this.longPressTimeoutId = undefined;
    }

    if (hadActiveAudio && this.botAudio) {
      if (!this.longPressTriggered && isActualPointerUp) {
        this.toggleAudioPlayback();
      }
      this.longPressTriggered = false;
      return;
    }

    if (this.listenTimeoutId) {
      clearTimeout(this.listenTimeoutId);
      this.listenTimeoutId = undefined;
    }

    this.longPressTriggered = false;
    this.stopListening();
  }

  // ---------------- MIC BEEP (activation sound) ----------------

  playBeep() {
    const audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 550; // mic-like tone

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.20);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.20);
  }
  
  scrollToBottom(force = false) {
    if (!isPlatformBrowser(this.platformId)) return;
    requestAnimationFrame(() => {
      const container = this.messagesContainer?.nativeElement;
      if (!container) return;

      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const isNearBottom = distanceFromBottom <= 20;

      if (force || isNearBottom) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
        this.showScrollToLatest = false;
      } else {
        this.showScrollToLatest = true;
      }
    });
  }


  // ---------------- SPEECH RECOGNITION SETUP ----------------

  private finalText = '';
  private allTranscriptions: string[] = [];
  private lastFinalTranscript = '';

  private logTranscriptions() {
    console.log('All transcriptions:', this.allTranscriptions);
  }

  private initializeClientInfo() {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const stored = sessionStorage.getItem(this.clientInfoStorageKey);
      if (stored) {
        this.clientInfo = JSON.parse(stored) as ClientInfo;
        return;
      }
    } catch (error) {
      console.warn('Failed to read stored client info', error);
    }

    const detected = this.detectClientInfo();
    this.clientInfo = detected;

    try {
      sessionStorage.setItem(this.clientInfoStorageKey, JSON.stringify(detected));
    } catch (error) {
      console.warn('Failed to store client info', error);
    }
  }

  private detectClientInfo(): ClientInfo {
    if (!isPlatformBrowser(this.platformId)) {
      return {
        os: 'Unknown',
        browser: 'Unknown',
        userAgent: ''
      };
    }
    const ua = navigator.userAgent || '';
    return {
      os: this.extractOS(ua),
      browser: this.extractBrowser(ua),
      userAgent: ua
    };
  }

  private extractOS(ua: string): string {
    if (/windows nt/i.test(ua)) return 'Windows';
    if (/mac os x/i.test(ua)) return 'macOS';
    if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
    if (/android/i.test(ua)) return 'Android';
    if (/linux/i.test(ua)) return 'Linux';
    return 'Unknown';
  }

  private extractBrowser(ua: string): string {
    if (/edg/i.test(ua)) return 'Edge';
    if (/opr|opera/i.test(ua)) return 'Opera';
    if (/chrome|crios/i.test(ua)) return 'Chrome';
    if (/safari/i.test(ua) && !/chrome|crios|opr|edg/i.test(ua)) return 'Safari';
    if (/firefox|fxios/i.test(ua)) return 'Firefox';
    return 'Unknown';
  }

  private scheduleListeningStart() {
    if (this.listenTimeoutId) {
      clearTimeout(this.listenTimeoutId);
    }
    this.listenTimeoutId = window.setTimeout(() => {
      this.startListening();
    }, 250);
  }

  private beginAudioLongPressDetection() {
    this.longPressTriggered = false;
    if (this.longPressTimeoutId) {
      clearTimeout(this.longPressTimeoutId);
    }
    this.longPressTimeoutId = window.setTimeout(() => {
      this.longPressTimeoutId = undefined;
      this.longPressTriggered = true;
      this.resetBotAudioState();
      this.playBeep();
      this.scheduleListeningStart();
    }, this.longPressDuration);
  }

  private createMessageId(prefix: 'user' | 'bot') {
    this.messageCounter += 1;
    return `${prefix}-${Date.now()}-${this.messageCounter}`;
  }

  private setActiveMessage(message: ChatMessage) {
    this.activeBotMessage = message;
    this.activeMessageId = message.id;
    this.focusActiveMessage();
  }

  private focusActiveMessage() {
    if (!isPlatformBrowser(this.platformId) || !this.activeMessageId) {
      return;
    }
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-message-id="${this.activeMessageId}"]`);
      if (el && 'scrollIntoView' in el) {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  private toggleAudioPlayback() {
    if (!this.botAudio) return;
    if (this.botAudio.paused) {
      this.botAudio.play().then(() => {
        this.isAudioPaused = false;
        this.isBotTalking = true;
        this.cdr.detectChanges();
      }).catch((error) => {
        console.error('Failed to resume audio', error);
        this.resetBotAudioState();
      });
    } else {
      this.botAudio.pause();
      this.isAudioPaused = true;
      this.isBotTalking = false;
      this.cdr.detectChanges();
    }
  }

  openSignIn() {
    this.isSigninDialogOpen = false;
    this.router.navigate(['/signin']).catch((error) => {
      console.error('Failed to navigate to sign in page', error);
    });
  }

  goToPayment(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.closeVoiceDialog();
    this.closeModelPanel();
    this.router.navigate(['/payment']).catch((error) => {
      console.error('Failed to navigate to payment page', error);
    });
  }

  onMessagesScroll() {
    if (!isPlatformBrowser(this.platformId)) return;
    const container = this.messagesContainer?.nativeElement;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const shouldShow = distanceFromBottom > 20;
    if (this.showScrollToLatest !== shouldShow) {
      this.showScrollToLatest = shouldShow;
    }
  }

  private shouldPromptSignIn(data: any): boolean {
    const detail = (data?.details || data?.error || '').toString().toLowerCase();
    return detail.includes('end of the book') || detail.includes('sign in');
  }

  private openSigninDialog() {
    if (this.session()) {
      return;
    }
    if (this.isSigninDialogOpen) return;
    this.isSigninDialogOpen = true;
    this.cdr.detectChanges();
  }

  closeSigninDialog() {
    this.isSigninDialogOpen = false;
    this.cdr.detectChanges();
  }

  goToSignInFromDialog() {
    this.closeSigninDialog();
    this.openSignIn();
  }

  private handleBookAutoAdvance(data: any, hasAudio: boolean) {
    if (data?.type !== 'book_playback') {
      return;
    }
    const progress = this.extractBookProgress(data);
    if (!progress) {
      return;
    }
    if (progress.chunk >= progress.total) {
      this.pendingBookAdvance = null;
      this.bookAdvanceTracker.delete(progress.id);
      return;
    }
    const lastChunk = this.bookAdvanceTracker.get(progress.id);
    if (lastChunk === progress.chunk) {
      return;
    }
    this.pendingBookAdvance = progress;
    if (!hasAudio) {
      this.flushBookAdvanceRequest();
    }
  }

  private flushBookAdvanceRequest() {
    if (!this.pendingBookAdvance) {
      return;
    }
    const { id, chunk, total } = this.pendingBookAdvance;
    if (chunk >= total) {
      this.pendingBookAdvance = null;
      return;
    }
    const lastChunk = this.bookAdvanceTracker.get(id);
    if (lastChunk === chunk) {
      this.pendingBookAdvance = null;
      return;
    }
    this.bookAdvanceTracker.set(id, chunk);
    this.pendingBookAdvance = null;
    this.sendTTSRequest('next');
  }

  private extractBookProgress(data: any): { id: string; chunk: number; total: number } | null {
    const source = data?.book ?? data;
    if (!source) {
      return null;
    }
    const chunk = this.toNumber(
      source.chunk ?? source.chunk_index ?? data?.chunk ?? data?.chunk_index
    );
    const total = this.toNumber(
      source.total_chunks ?? source.totalChunks ?? data?.total_chunks ?? data?.totalChunks
    );
    if (chunk === null || total === null) {
      return null;
    }
    const id = typeof source.id === 'string' ? source.id : 'book-playback';
    return { id, chunk, total };
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private pauseActiveTyping() {
    if (!this.activeBotMessage || !this.activeBotMessage.isTyping) {
      return;
    }
    this.cancelTypingEffect(this.activeBotMessage.id);
  }

  private resumeActiveTyping() {
    if (!this.activeBotMessage) {
      return;
    }
    const { displayText = '', text = '' } = this.activeBotMessage;
    if (displayText.length >= text.length) {
      return;
    }
    this.startTypingEffect(this.activeBotMessage, true);
  }

  private startTypingEffect(message: ChatMessage, preserveExisting = false) {
    if (!isPlatformBrowser(this.platformId)) {
      message.displayText = message.text;
      message.isTyping = false;
      return;
    }
    this.cancelTypingEffect(message.id);
    if (preserveExisting) {
      message.displayText = message.displayText ?? '';
    } else {
      message.displayText = '';
    }
    message.isTyping = true;

    const typeNext = () => {
      const currentLength = message.displayText?.length ?? 0;
      if (currentLength >= message.text.length) {
        message.isTyping = false;
        this.cancelTypingEffect(message.id);
        this.cdr.detectChanges();
        return;
      }

      const nextLength = currentLength + 1;
      message.displayText = message.text.slice(0, nextLength);
      this.cdr.detectChanges();
      this.scrollToBottom();

      const timeoutId = window.setTimeout(typeNext, this.typingSpeed);
      this.typingTimers.set(message.id, timeoutId);
    };

    typeNext();
  }

  private cancelTypingEffect(messageId: string) {
    const timeoutId = this.typingTimers.get(messageId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.typingTimers.delete(messageId);
    }
  }

  private clearAllTypingTimers() {
    this.typingTimers.forEach((id) => clearTimeout(id));
    this.typingTimers.clear();
  }

  toggleModelSelector(event?: Event) {
    event?.stopPropagation();
    if (this.isModelPanelOpen) {
      this.closeModelPanel();
      return;
    }
    this.isModelPanelOpen = true;
    this.modelError = '';
    this.voiceUpdateError = '';
    if (!this.auth.getSessionSnapshot()) {
      this.modelError = 'Sign in to hear voice models.';
      return;
    }
    if (!this.models.length) {
      this.loadVoiceModels();
    }
  }

  closeModelPanel() {
    this.isModelPanelOpen = false;
    this.modelError = '';
    this.stopSamplePlayback();
    this.voiceUpdateError = '';
    if (this.isVoiceConfirmOpen) {
      this.closeVoiceDialog();
    }
  }

  toggleSample(model: VoiceModel, event?: Event) {
    event?.stopPropagation();
    this.playSample(model);
  }

  async playSample(model: VoiceModel) {
    if (!model.sample?.data) {
      this.modelError = 'No preview is available for this model.';
      return;
    }
    if (this.playingModelId === model.id) {
      this.stopSamplePlayback();
      return;
    }
    this.stopSamplePlayback();
    try {
      const format = model.sample.format || 'mp3';
      const dataUrl = `data:audio/${format};base64,${model.sample.data}`;
      this.sampleAudio = new Audio(dataUrl);
      this.playingModelId = model.id;
      this.sampleAudio.onended = () => {
        this.playingModelId = null;
        this.sampleAudio = undefined;
        this.cdr.detectChanges();
      };
      await this.sampleAudio.play();
    } catch (error) {
      console.error('Failed to play model sample', error);
      this.modelError = 'Unable to play that preview. Try another model.';
      this.stopSamplePlayback();
    }
  }

  private async loadVoiceModels() {
    if (this.isModelLoading) {
      return;
    }
    this.isModelLoading = true;
    this.modelError = '';
    try {
      this.models = await firstValueFrom(this.modelService.fetchModels());
    } catch (error) {
      console.error('Failed to load models', error);
      this.modelError = this.extractModelError(error);
    } finally {
      this.isModelLoading = false;
      this.cdr.detectChanges();
    }
  }

  private stopSamplePlayback() {
    if (this.sampleAudio) {
      this.sampleAudio.pause();
      this.sampleAudio.currentTime = 0;
      this.sampleAudio = undefined;
    }
    this.playingModelId = null;
  }

  private extractModelError(error: unknown) {
    if (!error) {
      return 'Unable to load models right now.';
    }
    if (typeof error === 'string') {
      return error;
    }
    const httpError = error as { error?: unknown; message?: string; statusText?: string };
    if (httpError.error) {
      if (typeof httpError.error === 'string') {
        return httpError.error;
      }
      if (typeof httpError.error === 'object' && httpError.error) {
        const { detail, message } = httpError.error as { detail?: string; message?: string };
        if (message) {
          return message;
        }
        if (detail) {
          return detail;
        }
      }
    }
    if (httpError.message) {
      return httpError.message;
    }
    if (httpError.statusText) {
      return httpError.statusText;
    }
    return 'Unable to load models right now.';
  }

  promptVoiceChange(model: VoiceModel, event?: Event) {
    event?.stopPropagation();
    event?.preventDefault();
    if (!this.isVoiceFree(model)) {
      this.goToPayment(event);
      return;
    }
    this.pendingVoiceModel = model;
    this.voiceUpdateError = '';
    this.isVoiceConfirmOpen = true;
  }

  closeVoiceDialog() {
    this.isVoiceConfirmOpen = false;
    this.pendingVoiceModel = undefined;
    this.voiceUpdateError = '';
  }

  async confirmVoiceChange() {
    if (!this.pendingVoiceModel) {
      return;
    }
    this.isVoiceUpdating = true;
    this.voiceUpdateError = '';
    try {
      const response = await firstValueFrom(this.modelService.setVoice(this.pendingVoiceModel.id));
      const appliedName = response.voice_common_name || this.pendingVoiceModel.common_name || response.voice;
      this.voiceUpdateSuccess = `${appliedName} is now active.`;
      this.auth.updateVoice(response.voice, response.voice_common_name);
      this.closeVoiceDialog();
      this.closeModelPanel();
      setTimeout(() => {
        this.voiceUpdateSuccess = '';
        this.cdr.detectChanges();
      }, 3000);
      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (error) {
      console.error('Failed to update voice', error);
      this.voiceUpdateError = this.extractModelError(error);
    } finally {
      this.isVoiceUpdating = false;
      this.cdr.detectChanges();
    }
  }

  get primaryButtonLabel(): string {
    if (this.hasActiveAudio) {
      return this.isAudioPaused ? 'Resume playback' : 'Pause playback';
    }
    return this.isListening ? 'Listening…' : 'Press & hold anywhere';
  }

  get secondaryButtonLabel(): string {
    if (this.hasActiveAudio) {
      const chunk = this.activeBotMessage?.chunk;
      if (typeof chunk === 'number') {
        const total = this.activeBotMessage?.totalChunks;
        if (typeof total === 'number') {
          return `Chunk ${chunk}/${total}`;
        }
        return `Chunk ${chunk}`;
      }
      return 'Tap to control playback';
    }
    return 'Touch or click to activate the microphone';
  }

  setupSpeechRecognition() {
  if (!isPlatformBrowser(this.platformId)) return;

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.error("Speech Recognition not supported.");
    return;
  }

  this.recognition = new SpeechRecognition();
  this.recognition.continuous = true;
  this.recognition.interimResults = true;
  this.recognition.lang = 'en-US';

  this.recognition.onresult = (event: any) => {
  let interim = '';

  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];

    if (result.isFinal) {
      const finalText = result[0].transcript.trim();

      if (!finalText) {
        continue;
      }

      if (finalText === this.lastFinalTranscript) {
        continue;
      }

      this.lastFinalTranscript = finalText;

      // Store the final transcription
      this.allTranscriptions.push(finalText);
      this.logTranscriptions();

      this.finalText = [this.finalText, finalText].filter(Boolean).join(' ').trim();

      this.scrollToBottom();
    } else {
      interim = result[0].transcript;
      this.transcript = interim;
    }
  }
};



  this.recognition.onerror = (e: any) => {
    console.error("Speech recognition error:", e);
    this.flushFinalTranscript();
  };

  this.recognition.onend = () => {
    this.flushFinalTranscript();
  };
}

  private flushFinalTranscript() {
    const text = this.finalText.trim();
    if (!text) {
      this.finalText = '';
      return;
    }

    const userMessage: ChatMessage = {
      id: this.createMessageId('user'),
      from: 'user',
      text,
      displayText: text
    };

    this.messages.push(userMessage);
    this.sendTTSRequest(text);
    this.scrollToBottom();

    this.finalText = '';
    this.transcript = '';
  }

}
