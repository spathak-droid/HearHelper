import { Component, inject, PLATFORM_ID, AfterViewInit } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

declare var webkitSpeechRecognition: any;

@Component({
  selector: 'main-page',
  standalone: true,
  templateUrl: './mainPage.html',
  styleUrls: ['./mainPage.css'],
})
export class MainPage implements AfterViewInit {

  private platformId = inject(PLATFORM_ID);

  isListening = false;
  private mediaStream?: MediaStream;
  messages: { from: 'user' | 'bot', text: string }[] = [];


  recognition: any;
  transcript: string = '';

  constructor() {
    // DO NOT init speech here — SSR/hydration conflict.
  }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      // Wait for hydration to finish completely
      setTimeout(() => {
        this.setupSpeechRecognition();
      }, 200);
    }
  }

  // ---------------- LISTEN & STOP ----------------

  async startListening() {
  if (!isPlatformBrowser(this.platformId)) return;
  if (!this.recognition) return;
  if (this.isListening) return;

  this.isListening = true;
  this.finalText = '';   // reset final combined text
  this.transcript = '';  // reset what user sees

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
  this.playBeep();

  setTimeout(() => {
    this.startListening();
  }, 250); // prevents first word being cut
}


  onPointerUp(event: PointerEvent) {
    event.preventDefault();
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
  
  scrollToBottom() {
  setTimeout(() => {
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth'
    });
  }, 50);
}


  // ---------------- SPEECH RECOGNITION SETUP ----------------

  private finalText = '';
  private allTranscriptions: string[] = [];

  private logTranscriptions() {
    console.log('All transcriptions:', this.allTranscriptions);
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

      // Store the final transcription
      this.allTranscriptions.push(finalText);
      this.logTranscriptions();

      // Push USER message
      this.messages.push({
        from: 'user',
        text: finalText
      });

      // If your bot replies:
      this.messages.push({
        from: 'bot',
        text: 'You said: ' + finalText
      });

      this.scrollToBottom();

    } else {
      interim = result[0].transcript;
    }
  }
};



  this.recognition.onerror = (e: any) => {
    console.error("Speech recognition error:", e);
  };
}

}
