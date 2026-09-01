import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  OnInit,
  OnDestroy,
  output,
} from '@angular/core';

export type UiDialogAppearance = 'glass' | 'solid';

/** Modal dialog with backdrop, Escape/backdrop close, glass or solid appearance and a footer slot. */
@Component({
  selector: 'ui-dialog',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (open()) {
      <div class="ui-dialog__overlay" (click)="onOverlayClick()">
        <div
          class="ui-dialog"
          [class.ui-dialog--solid]="appearance() === 'solid'"
          [style.max-width]="maxWidth()"
          (click)="$event.stopPropagation()"
        >
          <header class="ui-dialog__header">
            <h3 class="ui-dialog__title">{{ title() }}</h3>
            <div class="ui-dialog__header-actions">
              <ng-content select="[uiDialogActions]" />
            </div>
            <button type="button" class="ui-dialog__close" (click)="closeDialog()" aria-label="Schließen">✕</button>
          </header>
          <div class="ui-dialog__body">
            <ng-content select=":not([uiDialogFooter])" />
          </div>
          <div class="ui-dialog__footer">
            <ng-content select="[uiDialogFooter]" />
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .ui-dialog__overlay {
      position: fixed;
      inset: 0;
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: var(--ui-overlay-bg);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .ui-dialog {
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 500px;
      max-height: 90vh;
      border-radius: var(--ui-radius-lg);
      background: var(--ui-dialog-bg);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border: 1px solid var(--ui-dialog-border);
      box-shadow: var(--ui-dialog-shadow);
      color: var(--ui-dialog-color);
      overflow: hidden;
    }

    .ui-dialog__header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--ui-divider);
      flex-shrink: 0;
    }

    .ui-dialog__title {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      line-height: 1.3;
    }

    .ui-dialog__header-actions {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .ui-dialog__close {
      background: transparent;
      border: none;
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
      color: inherit;
      opacity: 0.6;
      transition: opacity 0.2s;
      padding: 0;
    }

    .ui-dialog__close:hover {
      opacity: 1;
    }

    .ui-dialog__body {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.25rem;
      overflow-y: auto;
    }

    .ui-dialog__footer {
      display: flex;
      gap: 0.5rem;
      padding: 1rem 1.25rem;
      border-top: 1px solid var(--ui-divider);
      flex-shrink: 0;
    }

    .ui-dialog--solid {
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.1);
      box-shadow: 0 20px 45px rgba(15, 23, 42, 0.2);
      color: #1e293b;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }

    .ui-dialog--solid .ui-dialog__header {
      background: #f8fafc;
      border-bottom-color: #e2e8f0;
    }

    .ui-dialog--solid .ui-dialog__close {
      color: #64748b;
    }

    .ui-dialog--solid .ui-dialog__close:hover {
      color: #0f172a;
    }

    .ui-dialog--solid .ui-dialog__footer {
      border-top-color: #e2e8f0;
      background: #f8fafc;
    }
  `,
})
export class DialogComponent implements OnInit, OnDestroy {
  readonly open = model(false);
  readonly appearance = input<UiDialogAppearance>('glass');
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
      if (this.open()) {
        document.body.classList.add('modal-open');
      } else {
        document.body.classList.remove('modal-open');
      }
    });

    this.destroyRef.onDestroy(() => {
      document.body.classList.remove('modal-open');
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
