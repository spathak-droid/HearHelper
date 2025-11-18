import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

type FAQ = {
  question: string;
  answer: string;
};

@Component({
  selector: 'help-page',
  standalone: true,
  templateUrl: './helpPage.html',
  styleUrls: ['./helpPage.css'],
  imports: [RouterLink]
})
export class HelpPage {
  faqs: FAQ[] = [
    {
      question: 'What is HearHelper?',
      answer: 'HearHelper is a hands-free assistant that listens to your speech, sends it to our AI brain, and plays back natural sounding responses.'
    },
    {
      question: 'How do I talk to HearHelper?',
      answer: 'Press and hold anywhere on the main screen until you hear the beep. Keep holding while you speak, then release to send your message.'
    },
    {
      question: 'Can I replay what the assistant says?',
      answer: 'Yes! Tap the big mic button while it is speaking to pause or resume. Hold it down for two seconds to interrupt playback and start talking again.'
    },
    {
      question: 'Does it work with long form content?',
      answer: 'It can stream longer responses such as book narration chunk by chunk. The currently playing chunk is highlighted so you can follow along.'
    }
  ];
}
