/**
 * The placeholder a route shows while its chunk arrives (P21 route splitting).
 *
 * Own module so both the router (App.tsx, as the outer boundary) and the shell
 * (AppShell.tsx, as the inner one that keeps the chrome visible) can use it
 * without importing each other. Announced with role="status" so a screen
 * reader hears that something is loading instead of meeting a silent gap.
 */
export function RouteFallback() {
  return (
    <div className="sq-route-fallback" role="status">
      Loading…
    </div>
  );
}
