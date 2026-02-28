import { ref } from 'vue';

// Simple global action bridge for components that don't share provide/inject.
// Avoid storing any app state here; this is only a signal.

export const newConnectionRequested = ref(0);

export function requestNewConnection() {
  newConnectionRequested.value += 1;
}
