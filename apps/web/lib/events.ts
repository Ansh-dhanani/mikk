// Stub events module — satisfies imports from legacy components
// that reference this module but aren't used in the docs site.
export type Event = {
  name: string;
  properties?: Record<string, unknown>;
};

export function trackEvent(_event: Event): void {
  // no-op in docs context
}
