import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  OnDestroy,
  OnInit,
  output,
} from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/** JULE modal dialog: backdrop, Escape/backdrop close and a footer slot. */
@Component({
  selector: 'jule-dialog',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (open()) {
      <div class="jule-dialog-overlay" (click)="onOverlayClick()">
        <div class="jule-dialog" [style.max-width]="maxWidth()" (click)="$event.stopPropagation()">
          <header class="jule-dialog-head">
            <h3 class="jule-dialog-title">{{ title() }}</h3>
            <button type="button" class="jule-btn jule-btn--icon" (click)="closeDialog()" aria-label="Schließen">
              <app-icon name="times" />
            </button>
          </header>

          <div class="jule-dialog-body">
            <ng-content />
          </div>

          <div class="jule-dialog-foot">
            <ng-content select="[juleDialogFooter]" />
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .jule-dialog-overlay {
      position: fixed;
      inset: 0;
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgba(6, 4, 10, 0.72);
      -webkit-backdrop-filter: blur(6px);
      backdrop-filter: blur(6px);
    }

    .jule-dialog {
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 500px;
      max-height: 90vh;
      background: var(--jule-panel);
      border: 1px solid var(--jule-line);
      color: var(--jule-text);
      overflow: hidden;
    }

    .jule-dialog-head {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--jule-line);
      flex-shrink: 0;
    }

    .jule-dialog-title {
      margin: 0;
      font-family: var(--jule-font-display);
      font-weight: 400;
      font-size: 1.05rem;
      letter-spacing: -0.01em;
      line-height: 1.25;
    }

    .jule-dialog-head .jule-btn--icon {
      margin-left: auto;
    }

    .jule-dialog-body {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.25rem;
      overflow-y: auto;
    }

    .jule-dialog-foot {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      padding: 1rem 1.25rem;
      border-top: 1px solid var(--jule-line);
      flex-shrink: 0;
    }

    .jule-dialog-foot:empty {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class JuleDialogComponent implements OnInit, OnDestroy {
  readonly open = model(false);
  readonly title = input<string>();
  readonly closeOnBackdrop = input(true);
  readonly closeOnEscape = input(true);
  readonly maxWidth = input('500px');
  readonly close = output<void>();

  private readonly destroyRef = inject(DestroyRef);

  private onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.open() && this.closeOnEscape()) {
      this.closeDialog();
    }
  };

  constructor() {
    effect(() => {
      document.body.classList.toggle('jule-modal-open', this.open());
    });

    this.destroyRef.onDestroy(() => {
      document.body.classList.remove('jule-modal-open');
    });
  }

  ngOnInit(): void {
    document.addEventListener('keydown', this.onKeydown);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onKeydown);
  }

  protected onOverlayClick(): void {
    if (this.closeOnBackdrop()) {
      this.closeDialog();
    }
  }

  protected closeDialog(): void {
    this.open.set(false);
    this.close.emit();
  }
}
