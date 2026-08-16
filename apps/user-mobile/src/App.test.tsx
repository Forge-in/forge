import { render, screen } from '@testing-library/react-native';

import App from './App';

/**
 * A render smoke test. Thin on its own — the point is that the harness exists and is
 * proven wired, because this is where the tests that actually matter for this app will
 * live: offline/retry behaviour, the forced-upgrade screen, and OTP entry. Standing the
 * harness up now means the first real feature does not also have to invent it.
 *
 * Note for anyone extending this: in @testing-library/react-native v14 `render` is
 * ASYNC and no longer returns the query helpers — you must `await` it and then read
 * queries off `screen`. Forgetting the await gives you a Promise that silently passes
 * assertions like `expect(...).not.toThrow()`, which is a green test that checks nothing.
 */
describe('App', () => {
  it('mounts its root content', async () => {
    await render(<App />);
    expect(screen.getByText(/Open up App.tsx/i)).toBeTruthy();
  });

  it('renders a single root view', async () => {
    await render(<App />);
    expect(screen.toJSON()).not.toBeNull();
  });
});
