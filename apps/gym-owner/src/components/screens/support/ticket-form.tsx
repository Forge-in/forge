'use client';

import { useOwner } from '@/components/console/owner-provider';
import { Action, Field, SelectInput, TextArea, TextInput } from '@/components/ui/controls';
import { StatusPill } from '@/components/ui/primitives';
import { DemoButton } from '@/components/console/demo-button';
import {
  TICKET_BODY_MIN,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketPriority,
} from '@/lib/data';
import { TICKET_STATE_TONE } from '@/lib/tone';

/**
 * "Tell us what's wrong."
 *
 * A real `<form>` with `onSubmit`, so Enter works and the browser's own
 * validation semantics apply. Validation itself is deliberate rather than
 * native: the body rule is a minimum LENGTH, and `minlength` would block
 * submission with a browser tooltip the owner cannot read against this palette
 * and cannot copy into a support chat.
 */
export function TicketForm() {
  const { ticketDraft, ticketError, setTicketField, submitTicket, clearTicket } = useOwner();

  const bodyLength = ticketDraft.body.trim().length;
  const bodyShort = bodyLength > 0 && bodyLength < TICKET_BODY_MIN;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitTicket();
      }}
      noValidate
      className="flex flex-col gap-[18px]"
    >
      <div className="flex flex-col gap-[7px]">
        <h2 className="t-section-lg">Tell us what’s wrong — or what’s missing</h2>
        <p className="t-mono-sm text-muted">
          Goes straight to the Wrath product team. Bugs are triaged within a working day on Pro.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-[14px]">
        <Field label="Type">
          {(props) => (
            <SelectInput
              {...props}
              name="category"
              value={ticketDraft.category}
              onChange={(event) => setTicketField('category', event.target.value as TicketCategory)}
            >
              {TICKET_CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </SelectInput>
          )}
        </Field>

        <Field label="Urgency">
          {(props) => (
            <SelectInput
              {...props}
              name="priority"
              value={ticketDraft.priority}
              onChange={(event) => setTicketField('priority', event.target.value as TicketPriority)}
            >
              {TICKET_PRIORITIES.map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </SelectInput>
          )}
        </Field>
      </div>

      <Field label="Subject" invalid={Boolean(ticketError) && !ticketDraft.subject.trim()}>
        {(props) => (
          <TextInput
            {...props}
            name="subject"
            value={ticketDraft.subject}
            onChange={(event) => setTicketField('subject', event.target.value)}
            placeholder="One line — e.g. Cash entries not showing in daily revenue"
          />
        )}
      </Field>

      <Field
        label="What happened"
        // A live count, so the minimum is something to work towards rather than
        // a rule that only appears once submission has already failed.
        hint={
          bodyShort
            ? `${bodyLength}/${TICKET_BODY_MIN} characters — a sentence is enough`
            : undefined
        }
        invalid={bodyShort}
      >
        {(props) => (
          <TextArea
            {...props}
            name="body"
            rows={5}
            value={ticketDraft.body}
            onChange={(event) => setTicketField('body', event.target.value)}
            placeholder="Steps you took, what you expected, what you saw instead."
            className="h-[120px]"
          />
        )}
      </Field>

      {ticketError ? (
        <p
          role="alert"
          className="bg-warn-soft border-warn t-mono text-warn rounded-[14px] border px-[15px] py-3"
        >
          {ticketError}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <p className="t-mono-xs text-muted">
          Screenshots and your gym ID are attached automatically.
        </p>
        <div className="flex items-center gap-[10px]">
          <Action
            variant="ghost"
            onClick={clearTicket}
            className="t-sm h-[42px] rounded-[21px] px-[18px] font-medium"
          >
            Clear
          </Action>
          <Action type="submit" variant="gold" className="t-base h-[42px] rounded-[21px] px-6">
            Send to Wrath
          </Action>
        </div>
      </div>
    </form>
  );
}

/**
 * The owner's filed reports.
 *
 * A client component so a freshly sent report appears at the top of the list
 * immediately — the whole point of the confirmation is seeing it land.
 */
export function TicketList() {
  const { tickets } = useOwner();
  const open = tickets.filter((ticket) => ticket.state === 'Open').length;

  return (
    <>
      <div className="ow-divide-b flex items-center justify-between gap-4 px-[26px] py-5">
        <h2 className="t-section">Your reports</h2>
        <p aria-live="polite" className="t-mono-xs text-muted">
          {tickets.length} reports · {open} open
        </p>
      </div>

      <ul>
        {tickets.map((ticket) => (
          <li key={ticket.id} className="ow-divide-b flex items-center gap-[18px] px-[26px] py-4">
            <span className="t-mono text-muted w-[74px] shrink-0">{ticket.id}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
              <span className="t-base font-medium">{ticket.subject}</span>
              <span className="t-mono-xs text-muted">{ticket.meta}</span>
            </span>
            <StatusPill tone={TICKET_STATE_TONE[ticket.state]}>{ticket.state}</StatusPill>
            <DemoButton
              toast={`Opening thread ${ticket.id}`}
              variant="plain"
              srSuffix={ticket.subject}
              className="t-mono-xl text-muted shrink-0"
              label="Open"
              icon="›"
              hideLabel
            />
          </li>
        ))}
      </ul>
    </>
  );
}
