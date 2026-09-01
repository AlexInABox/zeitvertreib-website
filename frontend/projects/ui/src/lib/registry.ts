import type { Type } from '@angular/core';

/**
 * Metadata describing one signal input / model input of a UI component.
 * Extracted automatically from the component source by
 * `tools/generate-ui-registry.mjs`.
 */
export interface UiInputMeta {
  name: string;
  type: string | null;
  default: string | number | boolean | null;
  required: boolean;
  twoWay?: boolean;
}

/**
 * A single interactive example rendered on the /ui preview page.
 * Live in `<name>.demo.ts` files next to the component they showcase.
 */
export interface UiDemoEntry {
  title: string;
  component: Type<unknown>;
  code: string;
}

/**
 * Full metadata for one UI library component. The array itself
 * (`UI_REGISTRY`) lives in `registry.generated.ts` and is regenerated
 * automatically whenever the library changes.
 */
export interface UiComponentMeta {
  name: string;
  selector: string;
  description: string;
  inputs: UiInputMeta[];
  outputs: string[];
  component: Type<unknown>;
  demos: UiDemoEntry[];
}
