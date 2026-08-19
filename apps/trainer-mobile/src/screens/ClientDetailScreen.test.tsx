import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ToastProvider } from '../components/ui/ToastProvider';
import { NavigationProvider } from '../navigation/NavigationProvider';
import { ThemeProvider } from '../theme';
import { ClientDetailScreen } from './ClientDetailScreen';

/**
 * The unresolvable-client branch, which cannot be reached through the UI — every roster row
 * links to an id that exists. It is reachable in production the moment this screen is opened
 * from a notification, a deep link, or a roster that has since changed under it, so it is worth
 * proving it degrades into something a trainer can act on rather than a blank screen.
 */
function Harness({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider initialTheme="dark">
      <ToastProvider>
        <NavigationProvider>{children}</NavigationProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

describe('an unknown client', () => {
  it('explains itself instead of rendering an empty profile', async () => {
    await render(
      <Harness>
        <ClientDetailScreen clientId="someone-who-left" />
      </Harness>,
    );

    expect(screen.getByText('Client not found')).toBeTruthy();
    expect(screen.getByText('This profile is no longer on your roster.')).toBeTruthy();
    expect(screen.getByText('Back to clients')).toBeTruthy();
  });

  it('offers a way out that does not throw', async () => {
    await render(
      <Harness>
        <ClientDetailScreen clientId="someone-who-left" />
      </Harness>,
    );

    await act(async () => {
      await fireEvent.press(screen.getByText('Back to clients'));
    });
    // The screen is rendered outside a router switch here, so it stays mounted; what matters is
    // that the escape hatch dispatches cleanly rather than tearing down on a missing client.
    expect(screen.getByText('Client not found')).toBeTruthy();
  });
});

describe('a known client', () => {
  it('renders the profile of the id it was given', async () => {
    await render(
      <Harness>
        <ClientDetailScreen clientId="vikram-rao" />
      </Harness>,
    );

    expect(screen.getByText('Vikram Rao')).toBeTruthy();
    expect(screen.getByText('Strength Base · paused 18 Jul')).toBeTruthy();
    expect(screen.getByText('23%')).toBeTruthy();
  });

  it('falls back to a monogram when the client has no photo', async () => {
    await render(
      <Harness>
        <ClientDetailScreen clientId="divya-patel" />
      </Harness>,
    );

    // Divya has no plan, so the programme block has to say so rather than print "Week null".
    expect(screen.getByText('No plan yet')).toBeTruthy();
    // The monogram stands in for a photo, so it is deliberately hidden from assistive tech —
    // the client's name is already announced by the heading right beneath it. That is why the
    // query has to opt into hidden elements to see it at all.
    expect(screen.getByText('DP', { includeHiddenElements: true })).toBeTruthy();
  });
});
