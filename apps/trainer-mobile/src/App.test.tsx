import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import App from './App';

/**
 * End-to-end coverage of the trainer app.
 *
 * Everything below the native edges stubbed in `jest.setup.js` is the real thing — the reducer,
 * the router, the theme and every screen — so these tests fail if a journey breaks, not just if
 * a mock does.
 *
 * Note for anyone extending this: in @testing-library/react-native v14 BOTH `render` and
 * `fireEvent` are ASYNC, and `render` no longer returns the query helpers — you must `await`
 * them and read queries off `screen`. Forgetting the await on `render` gives you a Promise that
 * silently passes assertions like `expect(...).not.toThrow()`. Forgetting it on `fireEvent` is
 * worse: the press is dispatched but the resulting re-render has not been flushed, so the very
 * next assertion reads the previous screen and the failure looks like a broken feature.
 */

const openApp = async () => {
  await render(<App />);
  // The startup gate resolves the stored theme asynchronously, so the first assertion has to
  // wait for the app rather than the splash.
  await screen.findByTestId('start-session');
};

/**
 * Runs `body` with the clock under the test's control.
 *
 * Every toast assertion needs this. A toast auto-dismisses after TOAST_DURATION_MS of REAL
 * wall-clock time, so asserting on one is otherwise a race against the machine: on a loaded CI
 * runner a press and its re-render can take longer than the toast lives, and the query finds
 * nothing. That is not hypothetical — it is what turned "sits at the same height on every
 * screen" red while the layout it checks was perfectly correct. Freezing the clock takes the
 * machine out of the assertion entirely.
 *
 * Timers are faked only after the app has mounted: the startup gate resolves on real
 * microtasks, and faking them before that stalls the render.
 */
const withFakeTimers = async (body: () => Promise<void>) => {
  jest.useFakeTimers();
  try {
    await body();
  } finally {
    jest.useRealTimers();
  }
};

describe('Today', () => {
  it('opens on Today with the trainer and the next session', async () => {
    await openApp();

    expect(screen.getByText('Rahul Mehra')).toBeTruthy();
    expect(screen.getByText('HIIT Conditioning')).toBeTruthy();
    expect(screen.getByText('9:00')).toBeTruthy();
    expect(screen.getByText('Start session')).toBeTruthy();
    expect(screen.getByText('6 of 8 booked')).toBeTruthy();
  });

  it('lists the day ahead', async () => {
    await openApp();

    expect(screen.getByText('Priya S. + Arjun K.')).toBeTruthy();
    expect(screen.getByText('Overlap')).toBeTruthy();
    expect(screen.getByText('Unconfirmed · nudge sent 2d ago')).toBeTruthy();
  });

  it('raises a toast from the notification bell', async () => {
    await openApp();

    await withFakeTimers(async () => {
      await fireEvent.press(screen.getByTestId('notifications'));
      expect(screen.getByText('3 unread · nudges and booking requests')).toBeTruthy();
    });
  });

  it('sends the slipping prompt to the roster', async () => {
    await openApp();

    await fireEvent.press(screen.getByTestId('slipping-prompt'));
    expect(screen.getByText('Your clients')).toBeTruthy();
  });
});

describe('theme', () => {
  it('switches between dark and light, and the label names the next theme', async () => {
    await openApp();

    expect(screen.getByText('Light')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('theme-toggle'));
    expect(screen.getByText('Dark')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('theme-toggle'));
    expect(screen.getByText('Light')).toBeTruthy();
  });
});

describe('tab navigation', () => {
  it('moves between the three tab roots', async () => {
    await openApp();

    await fireEvent.press(screen.getByTestId('tab-clients'));
    expect(screen.getByText('Your clients')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('tab-plans'));
    expect(screen.getByText('Lower Body Build')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('tab-today'));
    expect(screen.getByText('Rahul Mehra')).toBeTruthy();
  });
});

describe('Clients', () => {
  const openRoster = async () => {
    await openApp();
    await fireEvent.press(screen.getByTestId('tab-clients'));
  };

  it('shows the whole roster by default', async () => {
    await openRoster();

    expect(screen.getByText('6 of 6 shown')).toBeTruthy();
    expect(screen.getByText('Vikram R.')).toBeTruthy();
  });

  it('narrows to the lapsed client', async () => {
    await openRoster();

    await fireEvent.press(screen.getByTestId('filter-lapsed'));
    expect(screen.getByText('1 of 6 shown')).toBeTruthy();
    expect(screen.getByText('Vikram R.')).toBeTruthy();
    expect(screen.queryByText('Priya S.')).toBeNull();
  });

  it('opens the client that was tapped, not a fixed profile', async () => {
    await openRoster();

    await fireEvent.press(screen.getByTestId('client-priya-sharma'));
    expect(screen.getByText('Priya Sharma')).toBeTruthy();
    expect(screen.getByText('Strength Base · assigned by you')).toBeTruthy();
    expect(screen.queryByText('Neha Desai')).toBeNull();
  });

  it('returns to the roster from a profile', async () => {
    await openRoster();

    await fireEvent.press(screen.getByTestId('client-neha-desai'));
    expect(screen.getByText('Neha Desai')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('client-back'));
    expect(screen.getByText('Your clients')).toBeTruthy();
  });
});

describe('client detail', () => {
  const openNeha = async () => {
    await openApp();
    await fireEvent.press(screen.getByTestId('tab-clients'));
    await fireEvent.press(screen.getByTestId('client-neha-desai'));
  };

  it("renders the design's adherence and programme figures", async () => {
    await openNeha();

    expect(screen.getByText('82%')).toBeTruthy();
    expect(screen.getByText('Week 4 of 12')).toBeTruthy();
    expect(screen.getByText('33%')).toBeTruthy();
    expect(screen.getByText('Next session today, 12:00')).toBeTruthy();
  });

  it('lists recent sessions', async () => {
    await openNeha();

    expect(screen.getByText('Posterior chain')).toBeTruthy();
    expect(screen.getByText('Deadlift 70×5')).toBeTruthy();
  });

  it('confirms logging progress with a toast', async () => {
    await openNeha();

    await withFakeTimers(async () => {
      await fireEvent.press(screen.getByTestId('log-progress'));
      expect(screen.getByText('Progress sheet open for Neha D.')).toBeTruthy();
    });
  });
});

describe('Plans', () => {
  const openPlans = async () => {
    await openApp();
    await fireEvent.press(screen.getByTestId('tab-plans'));
  };

  it('opens with Monday expanded', async () => {
    await openPlans();

    expect(screen.getByText('Back Squat')).toBeTruthy();
    expect(screen.getByText('4 × 6 · 60 kg')).toBeTruthy();
  });

  it('collapses the open day and expands another', async () => {
    await openPlans();

    await fireEvent.press(screen.getByTestId('plan-day-MON'));
    expect(screen.queryByText('Back Squat')).toBeNull();

    await fireEvent.press(screen.getByTestId('plan-day-WED'));
    expect(screen.getByText('Hip Thrust')).toBeTruthy();
  });

  it('publishes the selected week', async () => {
    await openPlans();

    await withFakeTimers(async () => {
      await fireEvent.press(screen.getByTestId('week-7'));
      await fireEvent.press(screen.getByTestId('publish-week'));
      expect(screen.getByText('Week 7 published to 4 clients')).toBeTruthy();
    });
  });
});

describe('the live session', () => {
  const startSession = async () => {
    await openApp();
    await fireEvent.press(screen.getByTestId('start-session'));
  };

  it('opens the runner, keeps the confirmation toast and hides the tab bar', async () => {
    await openApp();

    await withFakeTimers(async () => {
      await fireEvent.press(screen.getByTestId('start-session'));

      expect(screen.getByTestId('log-set')).toBeTruthy();
      expect(screen.getByText('Session started · 9:00 HIIT')).toBeTruthy();
      expect(screen.queryByTestId('tab-bar')).toBeNull();
    });
  });

  it('starts on the station the design seeds', async () => {
    await startSession();

    expect(screen.getByText('Kettlebell Swing')).toBeTruthy();
    expect(screen.getByText('Station 2 of 5')).toBeTruthy();
  });

  it('steps between stations and stops at the last one', async () => {
    await startSession();

    await fireEvent.press(screen.getByTestId('station-next'));
    expect(screen.getByText('Box Jump')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('station-previous'));
    expect(screen.getByText('Kettlebell Swing')).toBeTruthy();

    for (let i = 0; i < 6; i += 1) {
      await fireEvent.press(screen.getByTestId('station-next'));
    }
    expect(screen.getByText('Battle Rope')).toBeTruthy();
    expect(screen.getByText('Station 5 of 5')).toBeTruthy();
  });

  it('logs and undoes a set for the selected client', async () => {
    await startSession();

    expect(screen.getByText('7 sets logged')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('log-set'));
    expect(screen.getByText('8 sets logged')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('undo-set'));
    expect(screen.getByText('7 sets logged')).toBeTruthy();
  });

  it('will not log past the station target', async () => {
    await startSession();

    await fireEvent.press(screen.getByTestId('log-set'));
    expect(screen.getByText('8 sets logged')).toBeTruthy();

    // Priya is now at 3 of 3, so the button is disabled and further presses do nothing.
    await fireEvent.press(screen.getByTestId('log-set'));
    expect(screen.getByText('8 sets logged')).toBeTruthy();
  });

  it('follows the selected client', async () => {
    await startSession();

    await fireEvent.press(screen.getByTestId('room-neha-desai'));
    expect(screen.getByText('Neha D. · 0 of 3 sets on kettlebell swing')).toBeTruthy();

    // Neha is at zero, so undo is disabled and the count cannot go negative.
    await fireEvent.press(screen.getByTestId('undo-set'));
    expect(screen.getByText('7 sets logged')).toBeTruthy();
  });

  it('advances the clock every second while live, and stops when it ends', async () => {
    await openApp();

    await withFakeTimers(async () => {
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
    });
  });

  it('ends the session back on Today with a summary', async () => {
    await startSession();

    await withFakeTimers(async () => {
      await fireEvent.press(screen.getByTestId('end-session'));
      expect(screen.getByText('Rahul Mehra')).toBeTruthy();
      expect(screen.getByText('Session logged · 7 sets across 6 clients')).toBeTruthy();
    });
  });

  it('re-enters a running session instead of restarting it', async () => {
    await startSession();
    await fireEvent.press(screen.getByTestId('runner-back'));

    expect(screen.getByText('Open runner')).toBeTruthy();
    expect(screen.getByText('In session now')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('start-session'));
    expect(screen.getByTestId('log-set')).toBeTruthy();
  });
});

describe('check-in', () => {
  const openCheckIn = async () => {
    await openApp();
    await fireEvent.press(screen.getByTestId('go-attendance'));
  };

  it('counts everyone already checked in', async () => {
    await openCheckIn();

    expect(screen.getByText('Check in · 9:00 AM')).toBeTruthy();
    expect(screen.getByTestId('present-count')).toHaveTextContent('4');
  });

  it('checks a client in and back out', async () => {
    await openCheckIn();

    await fireEvent.press(screen.getByTestId('attendance-neha-desai'));
    expect(screen.getByTestId('present-count')).toHaveTextContent('5');

    await fireEvent.press(screen.getByTestId('attendance-neha-desai'));
    expect(screen.getByTestId('present-count')).toHaveTextContent('4');
  });

  it('promotes from the waitlist exactly once', async () => {
    await openCheckIn();

    await withFakeTimers(async () => {
      await fireEvent.press(screen.getByTestId('promote-rohan-tiwari'));
      expect(screen.getByText('Rohan T. promoted from waitlist')).toBeTruthy();
      expect(screen.getByText('Added')).toBeTruthy();
      expect(screen.getByTestId('present-count')).toHaveTextContent('5');

      await fireEvent.press(screen.getByTestId('promote-rohan-tiwari'));
      expect(screen.getByTestId('present-count')).toHaveTextContent('5');
    });
  });

  it('starts the session from check-in', async () => {
    await openCheckIn();

    await fireEvent.press(screen.getByTestId('attendance-start'));
    expect(screen.getByTestId('log-set')).toBeTruthy();
  });

  it('returns to Today', async () => {
    await openCheckIn();

    await fireEvent.press(screen.getByTestId('attendance-back'));
    expect(screen.getByText('Rahul Mehra')).toBeTruthy();
  });
});

describe('toasts', () => {
  /**
   * Regression: the toast used to be positioned relative to whether the tab bar was showing,
   * which dropped it to 24px on the runner — directly on top of "Log set", the one button
   * being tapped repeatedly during a session. The design pins it at a constant 110px on every
   * screen, and it has to stay that way.
   */
  it('sits at the same height on every screen, clear of the runner CTA', async () => {
    await openApp();

    await withFakeTimers(async () => {
      await fireEvent.press(screen.getByTestId('notifications'));
      const onTabbedScreen = StyleSheet.flatten(screen.getByTestId('toast').props.style);
      expect(onTabbedScreen.bottom).toBe(110);

      await fireEvent.press(screen.getByTestId('start-session'));
      expect(screen.queryByTestId('tab-bar')).toBeNull();
      const onRunner = StyleSheet.flatten(screen.getByTestId('toast').props.style);
      expect(onRunner.bottom).toBe(110);
    });
  });

  it('are cleared by navigating away', async () => {
    await openApp();

    await withFakeTimers(async () => {
      await fireEvent.press(screen.getByTestId('notifications'));
      expect(screen.getByTestId('toast')).toBeTruthy();

      await fireEvent.press(screen.getByTestId('tab-plans'));
      expect(screen.queryByTestId('toast')).toBeNull();
    });
  });
});
