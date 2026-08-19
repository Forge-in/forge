/**
 * Route definitions.
 *
 * The design's router is a single `route` string switched by `go(name)`, with each screen's
 * back affordance pointing at an explicit destination rather than at "wherever you came from".
 * That is modelled here as a flat route union plus a parent map — the same shape as Android's
 * Up navigation — which keeps the design's behaviour exact while giving the hardware back
 * button something correct to do.
 *
 * Routes carry typed params so the client detail screen renders the client that was tapped,
 * rather than the design's single hard-coded profile.
 */

export type Route =
  | { name: 'today' }
  | { name: 'clients' }
  | { name: 'plans' }
  | { name: 'clientDetail'; clientId: string }
  | { name: 'runner' }
  | { name: 'attendance' };

export type RouteName = Route['name'];

/** The three destinations reachable from the floating tab bar. */
export const TAB_ROUTES = ['today', 'clients', 'plans'] as const;
export type TabRouteName = (typeof TAB_ROUTES)[number];

export const INITIAL_ROUTE: Route = { name: 'today' };

/**
 * Where "back" goes from each screen. Absent means the screen is a root: hardware back there
 * falls through to the OS, which is what closes the app rather than trapping the user.
 */
const PARENTS: Partial<Record<RouteName, Route>> = {
  clientDetail: { name: 'clients' },
  runner: { name: 'today' },
  attendance: { name: 'today' },
};

export function parentOf(route: Route): Route | null {
  return PARENTS[route.name] ?? null;
}

/**
 * Which tab reads as selected for a given route.
 *
 * The design highlights "Clients" while the client detail screen is open; every other
 * non-tab route hides the bar entirely or leaves nothing selected.
 */
export function activeTabFor(route: Route): TabRouteName | null {
  if (route.name === 'clientDetail') return 'clients';
  return (TAB_ROUTES as readonly string[]).includes(route.name)
    ? (route.name as TabRouteName)
    : null;
}

/** The runner takes over the whole screen; every other route keeps the tab bar. */
export function showsTabBar(route: Route): boolean {
  return route.name !== 'runner';
}

export const TAB_LABELS: Record<TabRouteName, string> = {
  today: 'Today',
  clients: 'Clients',
  plans: 'Plans',
};
