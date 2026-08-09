'use client';

import { Action } from '@/components/ui/controls';
import { StatusBadge } from '@/components/ui/primitives';
import type { Gym } from '@/lib/data/types';
import { useConsole } from './console-provider';
import { ToastAction } from './toast-action';

/**
 * The detail header owns the one piece of live state on the page — whether the
 * organisation is suspended — so the badge and the button can never disagree.
 */
export function GymDetailHeader({ gym }: { gym: Gym }) {
  const { isSuspended, toggleSuspension } = useConsole();
  const suspended = isSuspended(gym.id);
  const status = suspended ? 'Suspended' : gym.status;

  return (
    <div className="hairline-b flex flex-wrap items-start justify-between gap-8 pb-6">
      <div className="flex items-center gap-5">
        <span aria-hidden="true" className="bg-line size-14 shrink-0" />
        <div className="flex flex-col gap-2">
          <h2 className="t-detail-title">{gym.name}</h2>
          <div className="flex flex-wrap items-center gap-[14px]">
            <span className="t-tag text-sub hairline px-[10px] py-[5px]">{gym.plan}</span>
            <StatusBadge status={status} />
            <span className="t-mono-sm text-muted">Customer since {gym.since}</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-[10px]">
        <ToastAction className="t-action px-[14px] py-[9px]">Message owner</ToastAction>
        <ToastAction className="t-action px-[14px] py-[9px]">Change plan</ToastAction>
        <Action
          variant="solid"
          onClick={() => toggleSuspension(gym)}
          className="t-action px-[14px] py-[9px]"
        >
          {suspended ? 'Reinstate' : 'Suspend'}
        </Action>
      </div>
    </div>
  );
}
