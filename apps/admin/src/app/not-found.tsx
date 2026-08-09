import Link from 'next/link';
import { WrathMark } from '@/components/ui/wrath-mark';

export default function NotFound() {
  return (
    <main className="bg-canvas text-ink flex min-h-dvh flex-col items-center justify-center gap-6 px-8 text-center">
      <WrathMark size={40} strokeWidth={6} />
      <div className="flex flex-col gap-3">
        <h1 className="t-signin-title">This page does not exist</h1>
        <p className="t-body leading-prose text-sub max-w-[420px] text-pretty">
          The link may be out of date, or the record it pointed at has been removed.
        </p>
      </div>
      <Link href="/overview" className="t-pill wc-solid px-5 py-[11px]">
        Back to overview
      </Link>
    </main>
  );
}
