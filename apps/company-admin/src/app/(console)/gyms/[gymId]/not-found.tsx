import { ActionLink } from '@/components/ui/controls';

/** Rendered inside the console shell, so the operator keeps their bearings. */
export default function GymNotFound() {
  return (
    <div className="flex flex-col gap-6 px-8 pt-[26px] pb-12">
      <ActionLink href="/gyms" className="t-tag text-sub self-start">
        ← All gyms
      </ActionLink>

      <div className="flex flex-col gap-3">
        <h2 className="t-detail-title">Organisation not found</h2>
        <p className="t-body leading-prose text-sub max-w-[460px] text-pretty">
          No organisation with that id is registered. It may have been removed, or the link is from
          another environment.
        </p>
      </div>

      <ActionLink href="/gyms" variant="solid" className="t-pill self-start px-5 py-[11px]">
        Back to the directory
      </ActionLink>
    </div>
  );
}
