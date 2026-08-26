'use client';

import { useOwner } from '@/components/console/owner-provider';
import { SwitchRow } from '@/components/ui/controls';
import { TRAINER_PERMISSION_SPECS } from '@/lib/data';

/**
 * What a trainer's phone is allowed to show.
 *
 * Every one of these is a decision about the owner's business — "See gym
 * revenue" hands a contractor the top line — so the helper text says what
 * turning it on actually exposes rather than restating the label.
 */
export function PermissionList() {
  const { permissions, togglePermission } = useOwner();

  return (
    <div className="flex flex-col">
      {TRAINER_PERMISSION_SPECS.map((spec) => (
        <SwitchRow
          key={spec.key}
          label={spec.label}
          help={spec.meta}
          checked={permissions[spec.key]}
          onToggle={() => togglePermission(spec.key, spec.label)}
        />
      ))}
    </div>
  );
}
