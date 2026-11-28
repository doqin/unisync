// Ô nhập văn bản bình luận hỗ trợ gõ `@` gợi ý tag người dùng Mutual (FR-SOC-03, FR-SOC-05).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Form } from 'react-bootstrap';
import Avatar from './Avatar.jsx';
import { MutualBadge } from './FollowButton.jsx';
import { findActiveMentionQuery, focusCaretAt } from '../lib/mentions.js';

export default function MentionTextarea({
  textareaRef,
  value,
  onChange,
  onKeyDown,
  mutuals = [],
  onMentionPicked,
  disabled = false,
  ...rest
}) {
  const innerRef = useRef(null);
  const [caretPos, setCaretPos] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const setRefs = (node) => {
    innerRef.current = node;
    if (typeof textareaRef === 'function') textareaRef(node);
    else if (textareaRef && typeof textareaRef === 'object') textareaRef.current = node;
  };

  const mentionState = useMemo(() => {
    if (disabled || caretPos === null) return null;
    return findActiveMentionQuery(value, caretPos, mutuals);
  }, [disabled, caretPos, value, mutuals]);

  useEffect(() => {
    setActiveIndex(0);
  }, [mentionState?.query, mentionState?.items.length]);

  const pickMutual = (mutual) => {
    if (!mentionState) return;
    const before = value.slice(0, mentionState.atIndex);
    const after = value.slice(mentionState.endIndex);
    const inserted = `@${mutual.full_name} `;
    const nextValue = `${before}${inserted}${after}`;
    const nextCaret = before.length + inserted.length;

    onChange?.({ target: { value: nextValue } });
    onMentionPicked?.(mutual);
    setCaretPos(nextCaret);
    focusCaretAt(innerRef.current, nextCaret);
  };

  const syncCaret = (el) => {
    if (!el) return;
    setCaretPos(el.selectionStart ?? el.value?.length ?? 0);
  };

  const handleKeyDown = (e) => {
    if (mentionState && mentionState.items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((cur) => (cur + 1) % mentionState.items.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((cur) => (cur - 1 + mentionState.items.length) % mentionState.items.length);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.nativeEvent?.isComposing) {
        e.preventDefault();
        pickMutual(mentionState.items[activeIndex] ?? mentionState.items[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCaretPos(null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="soc-mention-wrap">
      <Form.Control
        ref={setRefs}
        as="textarea"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          setCaretPos(e.target.selectionStart ?? e.target.value.length);
          onChange?.(e);
        }}
        onClick={(e) => syncCaret(e.currentTarget)}
        onKeyUp={(e) => {
          if (!['ArrowDown', 'ArrowUp', 'Escape'].includes(e.key)) syncCaret(e.currentTarget);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setCaretPos(null)}
        {...rest}
      />

      {mentionState && mentionState.items.length > 0 && (
        <div className="soc-mention-menu" role="listbox" aria-label="Gợi ý gắn thẻ người dùng Mutual">
          <div className="soc-mention-header">Gợi ý gắn thẻ (Mutual)</div>
          {mentionState.items.map((u, idx) => (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={idx === activeIndex}
              className={`soc-mention-item${idx === activeIndex ? ' is-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pickMutual(u);
              }}
            >
              <Avatar src={u.avatar_url} name={u.full_name} size={26} decorative />
              <span className="text-truncate flex-grow-1">{u.full_name}</span>
              <MutualBadge className="flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
