import { act, fireEvent, render, screen } from '@testing-library/react-native';

import App from './App';

/**
 * The runner clock, alone in its own file — deliberately.
 *
 * This is the only test in the app that swaps the global timer implementation, and jest's unit
 * of isolation is the FILE, not the test. While it lived in App.test.tsx it did measurable
 * damage on CI and none locally: across two runs every one of the 22 tests declared before it
 * passed, and 7 of the 9 declared after it failed — timing out at the ceiling rather than
 * failing an assertion, with @testing-library/react-native's cleanup unable to unmount and
 * later queries reading a stale tree from an earlier screen. Nothing reproduced on a developer
 * machine, including under CPU starvation and a single reused worker.
 *
 * Rather than keep guessing at how a discarded fake clock leaves React mid-flight, this gives
 * the problem a boundary the runner enforces: whatever this test leaves behind now dies with
 * its own worker environment instead of leaking into the next 9 tests.
 *
 * So: do not move this back, and do not add a second test to this file that does not need fake
 * timers. Its value is the isolation, not the location.
 */

const openApp = async () => {
  await render(<App />);
  // The startup gate resolves the stored theme asynchronously, so the first assertion has to
  // wait for the app rather than the splash.
  await screen.findByTestId('start-session');
};

describe('the runner clock', () => {
  it('advances the clock every second while live, and stops when it ends', async () => {
    await openApp();
    // Fake timers are switched on only after the app has mounted: the startup gate resolves on
    // real microtasks, and faking them before that stalls the render.
    jest.useFakeTimers();
    try {
      await fireEvent.press(screen.getByTestId('start-session'));
      // The design seeds 724 seconds so the runner opens mid-session.
      expect(screen.getByText('12:04')).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(31_000);
      });
      expect(screen.getByText('12:35')).toBeTruthy();

      await fireEvent.press(screen.getByTestId('end-session'));
      await act(async () => {
        jest.advanceTimersByTime(120_000);
      });
      await fireEvent.press(screen.getByTestId('start-session'));
      // Frozen at the moment it ended, not still counting through the two idle minutes.
      expect(screen.getByText('12:35')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
