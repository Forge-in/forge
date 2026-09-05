import { TAB_ROUTES, activeTabFor, parentOf, showsTabBar, type Route } from './routes';

describe('parentOf', () => {
  it.each<[Route, string]>([
    [{ name: 'clientDetail', clientId: 'neha-desai' }, 'clients'],
    [{ name: 'runner' }, 'today'],
    [{ name: 'attendance' }, 'today'],
  ])('sends %p back to %s', (route, expected) => {
    expect(parentOf(route)?.name).toBe(expected);
  });

  it.each(TAB_ROUTES)('leaves %s as a root so hardware back exits the app', (tab) => {
    expect(parentOf({ name: tab })).toBeNull();
  });
});

describe('activeTabFor', () => {
  it('keeps Clients lit while a client profile is open', () => {
    expect(activeTabFor({ name: 'clientDetail', clientId: 'neha-desai' })).toBe('clients');
  });

  it.each(TAB_ROUTES)('lights %s for its own route', (tab) => {
    expect(activeTabFor({ name: tab })).toBe(tab);
  });

  it('lights nothing on check-in, which is not a tab', () => {
    expect(activeTabFor({ name: 'attendance' })).toBeNull();
  });
});

describe('showsTabBar', () => {
  it('hides the bar in the runner, which takes over the screen', () => {
    expect(showsTabBar({ name: 'runner' })).toBe(false);
  });

  it.each<Route>([
    { name: 'today' },
    { name: 'clients' },
    { name: 'plans' },
    { name: 'attendance' },
    { name: 'clientDetail', clientId: 'neha-desai' },
  ])('keeps the bar on %p', (route) => {
    expect(showsTabBar(route)).toBe(true);
  });
});
