/**
 * Copies text to the clipboard.
 *
 * `navigator.clipboard` is unavailable outside a secure context — which includes
 * an admin console served over plain HTTP on a LAN — so this falls back to the
 * legacy selection trick and reports honestly when neither path works.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or the document is not focused; try the fallback.
    }
  }

  if (typeof document === 'undefined') return false;

  try {
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'fixed';
    scratch.style.top = '-9999px';
    scratch.style.opacity = '0';

    document.body.appendChild(scratch);
    scratch.select();
    scratch.setSelectionRange(0, text.length);

    const copied = document.execCommand('copy');
    document.body.removeChild(scratch);
    return copied;
  } catch {
    return false;
  }
}
