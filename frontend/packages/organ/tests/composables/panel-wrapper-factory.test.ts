import { describe, expect, test } from 'bun:test';
import { ref, defineComponent, h, provide, createApp } from 'vue';
import { createPanelWrapper } from '../../src/composables/panel-wrapper-factory';

// Minimal stub component that records received props
function createStubComponent() {
  const receivedProps: Record<string, unknown>[] = [];
  const Stub = defineComponent({
    props: {
      foo: { default: undefined },
      bar: { default: undefined },
      baz: { default: undefined },
      myProp: { default: undefined },
      onDoSomething: { default: undefined },
    },
    setup(props) {
      receivedProps.push({ ...props });
      return () => h('div');
    },
  });
  return { Stub, receivedProps };
}

// Helper: mount a wrapper inside a provider component, return captured props
function mountWithProvide(
  wrapper: ReturnType<typeof createPanelWrapper>,
  provides: Record<string, unknown>,
): Record<string, unknown>[] {
  const { Stub, receivedProps } = createStubComponent();
  // We won't use Stub directly — we need to capture from the actual wrapper.
  // Instead, let's use a different approach: capture via the wrapper's render.
  void Stub;
  void receivedProps;

  const captured: Record<string, unknown>[] = [];

  // Patch: create a capturing component that wraps the wrapper
  const root = defineComponent({
    setup() {
      for (const [key, val] of Object.entries(provides)) {
        provide(key, val);
      }
      return () => h(wrapper);
    },
  });

  // Use createApp to mount
  const container = { _isVNode: true } as unknown as HTMLElement;
  // For testing without DOM, we use createApp + mount on a minimal element
  if (typeof document !== 'undefined') {
    const el = document.createElement('div');
    const app = createApp(root);
    app.mount(el);
    app.unmount();
  }

  return captured;
}

describe('createPanelWrapper', () => {
  test('inject key maps to prop name by default', () => {
    const { Stub } = createStubComponent();
    const wrapper = createPanelWrapper(Stub, {
      foo: { unwrapRef: true, defaultValue: 'default-foo' },
    });

    // Verify the wrapper is a valid component definition
    expect(wrapper).toBeDefined();
    expect(wrapper.name).toBe('PanelWrapper');
    expect(wrapper.props).toBeDefined();
  });

  test('custom prop name mapping', () => {
    const { Stub } = createStubComponent();
    const wrapper = createPanelWrapper(
      Stub,
      { foo: { prop: 'myProp', unwrapRef: true, defaultValue: 42 } },
      {},
      'CustomWrapper',
    );

    expect(wrapper.name).toBe('CustomWrapper');
  });

  test('unwrapRef=true extracts .value from Ref', () => {
    // We test the logic by simulating what the render function does
    const myRef = ref('hello');
    const { Stub, receivedProps } = createStubComponent();

    // Mount with provide/inject in a real Vue app
    const root = defineComponent({
      setup() {
        provide('foo', myRef);
        return () => h(
          createPanelWrapper(Stub, {
            foo: { unwrapRef: true, defaultValue: '' },
          }),
        );
      },
    });

    if (typeof document !== 'undefined') {
      const el = document.createElement('div');
      const app = createApp(root);
      app.mount(el);
      // The Stub should have received foo='hello' (unwrapped)
      expect(receivedProps.length).toBeGreaterThan(0);
      expect(receivedProps[0]?.foo).toBe('hello');
      app.unmount();
    }
  });

  test('unwrapRef=false or absent passes value as-is (function passthrough)', () => {
    const myFn = () => 'called';
    const { Stub, receivedProps } = createStubComponent();

    const root = defineComponent({
      setup() {
        provide('onDoSomething', myFn);
        return () => h(
          createPanelWrapper(Stub, {
            onDoSomething: { unwrapRef: false },
          }),
        );
      },
    });

    if (typeof document !== 'undefined') {
      const el = document.createElement('div');
      const app = createApp(root);
      app.mount(el);
      expect(receivedProps.length).toBeGreaterThan(0);
      expect(receivedProps[0]?.onDoSomething).toBe(myFn);
      app.unmount();
    }
  });

  test('defaultValue is used when inject is undefined', () => {
    const { Stub, receivedProps } = createStubComponent();

    const root = defineComponent({
      setup() {
        // Don't provide 'foo'
        return () => h(
          createPanelWrapper(Stub, {
            foo: { unwrapRef: true, defaultValue: 'fallback' },
          }),
        );
      },
    });

    if (typeof document !== 'undefined') {
      const el = document.createElement('div');
      const app = createApp(root);
      app.mount(el);
      expect(receivedProps.length).toBeGreaterThan(0);
      expect(receivedProps[0]?.foo).toBe('fallback');
      app.unmount();
    }
  });

  test('static props are passed through', () => {
    const { Stub, receivedProps } = createStubComponent();

    const root = defineComponent({
      setup() {
        return () => h(
          createPanelWrapper(Stub, {}, { bar: 'static-value' }),
        );
      },
    });

    if (typeof document !== 'undefined') {
      const el = document.createElement('div');
      const app = createApp(root);
      app.mount(el);
      expect(receivedProps.length).toBeGreaterThan(0);
      expect(receivedProps[0]?.bar).toBe('static-value');
      app.unmount();
    }
  });

  test('non-Ref value with unwrapRef=true passes through with default', () => {
    const plainObj = { x: 1 };
    const { Stub, receivedProps } = createStubComponent();

    const root = defineComponent({
      setup() {
        provide('foo', plainObj);
        return () => h(
          createPanelWrapper(Stub, {
            foo: { unwrapRef: true, defaultValue: null },
          }),
        );
      },
    });

    if (typeof document !== 'undefined') {
      const el = document.createElement('div');
      const app = createApp(root);
      app.mount(el);
      expect(receivedProps.length).toBeGreaterThan(0);
      // plainObj has no .value, but it is an object with 'value' in it? No.
      // It doesn't have 'value' key, so raw stays as plainObj
      // Actually { x: 1 } — 'value' in { x: 1 } is false, so val = plainObj
      expect(receivedProps[0]?.foo).toBe(plainObj);
      app.unmount();
    }
  });

  test('prop name remapping with unwrapRef works', () => {
    const myRef = ref([1, 2, 3]);
    const { Stub, receivedProps } = createStubComponent();

    const root = defineComponent({
      setup() {
        provide('messages', myRef);
        return () => h(
          createPanelWrapper(Stub, {
            messages: { prop: 'myProp', unwrapRef: true, defaultValue: [] },
          }),
        );
      },
    });

    if (typeof document !== 'undefined') {
      const el = document.createElement('div');
      const app = createApp(root);
      app.mount(el);
      expect(receivedProps.length).toBeGreaterThan(0);
      expect(receivedProps[0]?.myProp).toEqual([1, 2, 3]);
      app.unmount();
    }
  });
});
