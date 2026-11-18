import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '../../api/http.js';
import { Button, EmptyState, ErrorState, FormError, Icon, InfoTooltip, Skeleton, Spinner, Textarea } from '../ui/index.js';
import { dateTime, dayLabel, timeShort } from '../../utils/format.js';
import { isFinalOrder, statusMeta } from '../../utils/status.js';
import styles from './OrderChat.module.css';

const cx = (...c) => c.filter(Boolean).join(' ');
const MAX_LENGTH = 2000;
const NEAR_BOTTOM = 96;

function DayGroups({ messages, order, user }) {
  const groups = useMemo(() => {
    const out = [];
    messages.forEach((m) => {
      const day = dayLabel(m.createdAt);
      let group = out.at(-1);
      if (!group || group.day !== day) {
        group = { day, items: [] };
        out.push(group);
      }
      group.items.push(m);
    });
    return out;
  }, [messages]);

  const nameFor = (m) => {
    if (String(m.sender?._id) === String(user._id)) return 'You';
    if (user.role === 'customer') return order.restaurant?.name || 'Restaurant';
    if (user.role === 'owner') return order.customer?.name || 'Customer';
    const roleLabels = { customer: 'Customer', owner: 'Restaurant', admin: 'GoodPanda' };
    const role = roleLabels[m.senderRole || m.sender?.role] || '';
    return `${m.sender?.name || 'Participant'}${role ? ` · ${role}` : ''}`;
  };

  return groups.map((group) => (
    <div key={group.day} className={styles.dayGroup}>
      <div className={styles.dayDivider} role="presentation">
        <span>{group.day}</span>
      </div>
      {group.items.map((m) => {
        const mine = String(m.sender?._id) === String(user._id);
        return (
          <div key={m._id} className={cx(styles.bubbleRow, mine && styles.mine)}>
            <span className={styles.meta}>
              <span className={styles.sender}>{nameFor(m)}</span>
              <time dateTime={m.createdAt} title={dateTime(m.createdAt)}>
                {timeShort(m.createdAt)}
              </time>
            </span>
            <div className={styles.bubble}>{m.text}</div>
          </div>
        );
      })}
    </div>
  ));
}

function ChatSkeleton() {
  return (
    <div className={styles.skeletonList} aria-busy="true" aria-label="Loading messages">
      {[62, 44, 72].map((width, i) => (
        <div key={width} className={cx(styles.skeletonRow, i % 2 === 1 && styles.skeletonMine)}>
          <Skeleton width={`${width}%`} height={i === 1 ? 38 : 52} />
        </div>
      ))}
    </div>
  );
}

/**
 * Messenger-style order chat. The page owns the data hook so the unread badge can live in
 * the page header and the same panel can be reused in the desktop rail and mobile drawer.
 */
export default function OrderChat({ order, user, chat, mode = 'card', visible = true, unread = 0 }) {
  const { messages, loading, error, send, reload } = chat;
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [pending, setPending] = useState([]);
  const [hasNew, setHasNew] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickRef = useRef(true);
  const countRef = useRef(0);
  const timerRef = useRef(null);

  const readOnly = isFinalOrder(order.status) || user.role === 'admin';
  const closed = isFinalOrder(order.status);
  const otherName = user.role === 'customer' ? order.restaurant?.name : order.customer?.name;
  const statusLabel = statusMeta('order', order.status).label;

  const scrollToBottom = (smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    stickRef.current = true;
    setHasNew(false);
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const total = messages.length + pending.length;
    const grew = total > countRef.current;
    countRef.current = total;
    if (!grew) return;
    if (stickRef.current) scrollToBottom();
    else setHasNew(true);
  }, [messages.length, pending.length]);

  useEffect(() => {
    if (!visible) return;
    scrollToBottom();
    countRef.current = messages.length + pending.length;
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    stickRef.current = near;
    if (near) setHasNew(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending || readOnly) return;
    const temp = { _id: `pending-${Date.now()}`, text, sender: { _id: user._id }, createdAt: new Date().toISOString(), pending: true };
    setDraft('');
    setSendError('');
    setPending((list) => [...list, temp]);
    setSending(true);
    stickRef.current = true;
    try {
      await send(text);
      setPending((list) => list.filter((m) => m._id !== temp._id));
    } catch (err) {
      setPending((list) => list.filter((m) => m._id !== temp._id));
      setDraft(text);
      setSendError(errorMessage(err));
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 104)}px`;
  }, [draft]);

  return (
    <section
      className={cx(styles.panel, mode === 'card' ? styles.card : styles.sheet)}
      aria-label={`Order chat with ${otherName || 'the restaurant'}`}
    >
      {mode === 'card' && (
        <header className={styles.header}>
          <span className={styles.headerIcon} aria-hidden="true">
            <Icon name="message" size={19} />
          </span>
          <div className={styles.headerText}>
            <h2 className={styles.title}>{otherName ? `Chat with ${otherName}` : 'Order chat'}</h2>
            <span className={styles.subtitle}>
              {closed
                ? `Read-only · order ${statusLabel.toLowerCase()}`
                : user.role === 'admin'
                  ? 'Read-only for admins'
                  : 'Messages stay with this order'}
            </span>
          </div>
          {unread > 0 && !closed && (
            <span className={styles.unread} aria-label={`${unread} unread messages`}>
              {unread} new
            </span>
          )}
        </header>
      )}

      {closed && (
        <div className={styles.closedNotice}>
          <Icon name="lock" size={16} />
          <span>Chat is closed because this order is {statusLabel.toLowerCase()}. The history stays here to read.</span>
          <InfoTooltip
            label="Why chat is closed"
            content="Conversations close when an order is collected, cancelled or rejected, so the record can’t change after the order is finished."
            size={14}
          />
        </div>
      )}

      <div className={styles.messageWrap}>
        <div
          ref={listRef}
          className={styles.log}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Messages"
          onScroll={onScroll}
          tabIndex={0}
        >
          {loading ? (
            <ChatSkeleton />
          ) : error ? (
            <ErrorState compact title="We couldn’t load the chat" error={error} onRetry={reload} />
          ) : messages.length === 0 && pending.length === 0 ? (
            <EmptyState compact icon={closed ? 'lock' : 'message'} title={closed ? 'No messages were exchanged' : 'No messages yet'}>
              {closed
                ? `This chat closed when the order was ${statusLabel.toLowerCase()}, so there is nothing to reply to.`
                : user.role === 'customer'
                  ? 'Ask the restaurant about your order, or say hello.'
                  : user.role === 'owner'
                    ? 'Message the customer if you need to clarify anything.'
                    : 'No messages between the customer and the restaurant yet.'}
            </EmptyState>
          ) : (
            <>
              <DayGroups messages={messages} order={order} user={user} />
              {pending.map((m) => (
                <div key={m._id} className={cx(styles.bubbleRow, styles.mine, styles.pendingBubble)}>
                  <span className={styles.meta}>
                    <span className={styles.sender}>You</span>
                    <span className={styles.sending}>
                      <Spinner size={11} label="Sending" />
                      Sending…
                    </span>
                  </span>
                  <div className={styles.bubble}>{m.text}</div>
                </div>
              ))}
            </>
          )}
        </div>

        {hasNew && (
          <Button size="sm" variant="secondary" icon="chevronDown" className={styles.jump} onClick={() => scrollToBottom(true)}>
            New messages
          </Button>
        )}
      </div>

      {!closed && user.role !== 'admin' && (
        <form className={styles.composer} onSubmit={submit}>
          <label htmlFor="chat-message" className="visually-hidden">
            Message
          </label>
          <Textarea
            ref={inputRef}
            id="chat-message"
            rows={1}
            value={draft}
            maxLength={MAX_LENGTH}
            placeholder="Type a message…"
            className={styles.input}
            disabled={sending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            aria-describedby={sendError ? 'chat-error' : undefined}
          />
          <Button
            type="submit"
            variant="primary"
            icon="send"
            iconOnly
            aria-label="Send message"
            loading={sending}
            disabled={!draft.trim()}
            className={styles.send}
          />
        </form>
      )}

      {!closed && user.role === 'admin' && (
        <div className={styles.adminNote}>
          <Icon name="shield" size={15} />
          Admins can read this chat but can’t send messages.
        </div>
      )}

      {sendError && (
        <div id="chat-error" className={styles.sendError}>
          <FormError error={sendError} />
        </div>
      )}

      {closed && mode === 'card' && (
        <div className={styles.cardFooter}>
          <Icon name="lock" size={15} />
          This conversation is now read-only.
        </div>
      )}
    </section>
  );
}
