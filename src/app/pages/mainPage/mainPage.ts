import { Component } from '@angular/core';

@Component({
  selector: 'main-page',
  standalone: true,
  templateUrl: './mainPage.html',
  styleUrls: ['./mainPage.css'],
})
export class MainPage {
  isListening = false;
  private mediaStream?: MediaStream;

  async startListening() {
    if (this.isListening) return;
    this.isListening = true;

    try {
      // Request mic access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      console.log('Mic started', this.mediaStream);
    } catch (error) {
      console.error('Could not access microphone:', error);
      this.isListening = false;
    }
  }

  stopListening() {
    if (!this.isListening) return;

    this.isListening = false;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = undefined;
      console.log('Mic stopped');
    }
  }

  // Called on any pointer down on the screen
  onPointerDown(event: PointerEvent) {
    event.preventDefault();
    this.startListening();
  }

  // Called when pointer is released / leaves / cancelled
  onPointerUp(event: PointerEvent) {
    event.preventDefault();
    this.stopListening();
  }
}
