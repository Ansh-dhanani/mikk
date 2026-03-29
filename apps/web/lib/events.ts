// Stub events module — satisfies imports from legacy components
// that reference this module but aren't used in the docs site.
export type Event = {
  name: string;
  properties?: Record<string, unknown>;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function trackEvent(..._args: unknown[]): void {
  // no-op in docs context
}
