import { useEffect, useRef, useState } from 'react';

/**
 * Counts chat messages that arrive while the chat is closed.
 * The history loaded when the page opens is treated as already read, so the badge
 * only appears for genuinely new messages (usually from the other party).
 */
export function useChatUnread(messages, { orderId, userId, visible }) {
  const [unread, setUnread] = useState(0);
  const seen = useRef(null);

  // A new order starts with a fresh history; ignore the previous order's message ids.
  useEffect(() => {
    seen.current = null;
    setUnread(0);
  }, [orderId]);

  // First successful load: everything in it is considered read.
  useEffect(() => {
    if (!seen.current) seen.current = new Set(messages.map((m) => m._id));
  }, [messages]);

  useEffect(() => {
    if (visible) setUnread(0);
  }, [visible]);

  useEffect(() => {
    if (!seen.current) return;
    let added = 0;
    messages.forEach((m) => {
      if (seen.current.has(m._id)) return;
      seen.current.add(m._id);
      if (!visible && String(m.sender?._id ?? m.sender) !== String(userId)) added += 1;
    });
    if (added) setUnread((n) => n + added);
  }, [messages, userId, visible]);

  return unread;
}
