/* V2-07 test setup — jsdom lacks ResizeObserver; registry.ts constructs one
 * per pane. A recording stub is enough: registry lifecycle tests assert
 * bookkeeping, not observation callbacks. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
  ResizeObserverStub;
