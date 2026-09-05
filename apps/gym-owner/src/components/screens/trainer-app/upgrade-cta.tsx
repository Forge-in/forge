'use client';

import { useRouter } from 'next/navigation';
import { useDemoAction } from '@/components/console/owner-provider';
import { Action } from '@/components/ui/controls';
import { rupees } from '@/lib/format';

/**
 * The upsell's primary action.
 *
 * It NAVIGATES to the billing screen and then explains why — an upgrade button
 * that only fires a toast leaves the owner on a locked page with no way to act
 * on what they just agreed to.
 */
export function UpgradeButton({ price }: { price: number }) {
  const router = useRouter();
  const notify = useDemoAction();

  return (
    <Action
      variant="gold"
      onClick={() => {
        router.push('/plan');
        notify('Wrath Pro selected · confirm payment to unlock trainer mobile');
      }}
      className="t-md h-12 rounded-[24px] px-[26px]"
    >
      Upgrade to Pro · {rupees(price)}/mo
    </Action>
  );
}
