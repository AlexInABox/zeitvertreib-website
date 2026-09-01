import { ChangeDetectionStrategy, Component, effect, input, signal, viewChild, ViewContainerRef } from '@angular/core';
import type { Type } from '@angular/core';
import type { UiDemoEntry } from '@app/ui';

@Component({
  selector: 'app-ui-demo-frame',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="frame">
      <div class="frame__bar">
        <span class="frame__title">{{ title() }}</span>
        <div class="frame__actions">
          <button type="button" class="frame__btn" (click)="showCode.set(!showCode())">
            {{ showCode() ? 'Demo ausblenden' : 'Code' }}
          </button>
          @if (showCode()) {
            <button type="button" class="frame__btn" (click)="copyCode()">
              {{ copied() ? 'Kopiert' : 'Kopieren' }}
            </button>
          }
        </div>
      </div>
      <div class="frame__body">
        <ng-container #anchor />
      </div>
      @if (showCode()) {
        <pre class="frame__code"><code>{{ demo().code }}</code></pre>
      }
    </div>
  `,
  styleUrl: './ui-demo-frame.component.css',
})
export class UiDemoFrameComponent {
  readonly title = input.required<string>();
  readonly demo = input.required<UiDemoEntry>();

  protected readonly showCode = signal(false);
  protected readonly copied = signal(false);

  private readonly anchor = viewChild('anchor', { read: ViewContainerRef });
  private lastDemo: UiDemoEntry | null = null;

  constructor() {
    effect(() => {
      const demo = this.demo();
      const anchor = this.anchor();
      if (!anchor || demo === this.lastDemo) {
        return;
      }
      this.lastDemo = demo;
      anchor.clear();
      anchor.createComponent(demo.component as Type<unknown>);
    });
  }

  protected copyCode(): void {
    navigator.clipboard
      .writeText(this.demo().code)
      .then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      })
      .catch(() => {
        // Clipboard unavailable (e.g. insecure context) — ignore.
      });
  }
}
