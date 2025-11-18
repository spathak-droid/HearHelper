import { Component, inject, PLATFORM_ID, AfterViewInit, OnDestroy, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';

declare var webkitSpeechRecognition: any;

declare var webkitSpeechRecognition: any;

type ChatMessage = {
  id: string;
  from: 'user' | 'bot';
  text: string;
  chunk?: number;
  totalChunks?: number;
  type?: string;
};

@Component({
  selector: 'main-page',
  standalone: true,
  templateUrl: './mainPage.html',
  styleUrls: ['./mainPage.css'],
})
export class MainPage implements AfterViewInit, OnDestroy {

  private platformId = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private socket: WebSocket | null = null;
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
  isProfilePaneOpen = false;
  isSigninDialogOpen = false;
  showScrollToLatest = false;
  private mediaStream?: MediaStream;
  messages: ChatMessage[] = [];
  activeMessageId: string | null = null;
  private activeBotMessage?: ChatMessage;
  private pendingTTSRequests: Array<{ type: 'tts'; text: string; message_id: string }> = [];
  private messageCounter = 0;

  recognition: any;
  transcript: string = '';

  constructor() {
    // DO NOT init speech here — SSR/hydration conflict.
  }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      // Initialize WebSocket connection
      this.initializeWebSocket();
      
      // Wait for hydration to finish completely
      setTimeout(() => {
        this.setupSpeechRecognition();
      }, 200);
    }
  }

  ngOnDestroy() {
    // Close WebSocket connection when component is destroyed
    if (this.socket) {
      this.socket.close();
    }

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
  }

  private initializeWebSocket() {
    this.socket = new WebSocket('ws://localhost:8000/ws/hat/');

    this.socket.onopen = () => {
      console.log('Connected to WebSocket');
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
          type: data.type
        };
        this.messages.push(botMessage);
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
    };
  }

  private sendTTSRequest(text: string) {
    const payload = {
      type: 'tts' as const,
      text,
      message_id: 'msg-' + Date.now()
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

    audio.onended = () => this.resetBotAudioState();

    audio.onerror = () => this.resetBotAudioState();

    audio.onpause = () => {
      if (audio.ended) {
        return;
      }
      this.isBotTalking = false;
      this.isAudioPaused = true;
      this.cdr.detectChanges();
    };

    audio.onplay = () => {
      this.isBotTalking = true;
      this.isAudioPaused = false;
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
    if (this.isProfilePaneOpen) {
      this.isProfilePaneOpen = false;
    }

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

  toggleProfilePane() {
    this.isProfilePaneOpen = !this.isProfilePaneOpen;
  }

  openSignIn() {
    this.isProfilePaneOpen = false;
    this.isSigninDialogOpen = false;
    this.router.navigate(['/signin']).catch((error) => {
      console.error('Failed to navigate to sign in page', error);
    });
  }

  openHelp() {
    this.isProfilePaneOpen = false;
    this.router.navigate(['/help']).catch((error) => {
      console.error('Failed to navigate to help page', error);
    });
  }

  onMessagesScroll() {
    if (!isPlatformBrowser(this.platformId)) return;
    const container = this.messagesContainer?.nativeElement;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    this.showScrollToLatest = distanceFromBottom > 20;
    this.cdr.detectChanges();
  }

  private shouldPromptSignIn(data: any): boolean {
    const detail = (data?.details || data?.error || '').toString().toLowerCase();
    return detail.includes('end of the book') || detail.includes('sign in');
  }

  private openSigninDialog() {
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
      text
    };

    this.messages.push(userMessage);
    this.sendTTSRequest(text);
    this.scrollToBottom();

    this.finalText = '';
    this.transcript = '';
  }

}
