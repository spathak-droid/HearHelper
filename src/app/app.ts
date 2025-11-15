import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MainPage } from './pages/mainPage/mainPage';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MainPage],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('HearHelper');
}
