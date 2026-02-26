import { defineComponent, h, inject, type Component, type PropType } from 'vue';
import type { IDockviewPanelProps } from 'dockview-vue';

/**
 * Describes how a single inject key maps to a component prop.
 */
export interface InjectMapping {
  /** The prop name passed to the wrapped component. Defaults to the inject key. */
  prop?: string;
  /** If true, unwrap `.value` from the injected Ref before passing as prop. */
  unwrapRef?: boolean;
  /** Default value when the inject is undefined (or its `.value` is undefined). */
  defaultValue?: unknown;
}

export type InjectMap = Record<string, InjectMapping>;

/**
 * Creates a Vue Options-API component that:
 * 1. Accepts `params` prop (for dockview)
 * 2. Injects values by key from the ancestor provide scope
 * 3. Renders the given component with props derived from the inject map + static props
 */
export function createPanelWrapper(
  component: Component,
  injectMap: InjectMap = {},
  staticProps: Record<string, unknown> = {},
  wrapperName?: string,
) {
  return defineComponent({
    name: wrapperName ?? 'PanelWrapper',
    props: { params: Object as PropType<IDockviewPanelProps> },
    setup() {
      // Resolve all injects once during setup
      const injected: Record<string, unknown> = {};
      for (const key of Object.keys(injectMap)) {
        injected[key] = inject(key);
      }

      return () => {
        const props: Record<string, unknown> = { ...staticProps };

        for (const [key, mapping] of Object.entries(injectMap)) {
          const propName = mapping.prop ?? key;
          const raw = injected[key];

          if (mapping.unwrapRef) {
            const val = raw != null && typeof raw === 'object' && 'value' in raw
              ? (raw as { value: unknown }).value
              : raw;
            props[propName] = val ?? mapping.defaultValue;
          } else {
            props[propName] = raw ?? mapping.defaultValue;
          }
        }

        return h(component, props);
      };
    },
  });
}
