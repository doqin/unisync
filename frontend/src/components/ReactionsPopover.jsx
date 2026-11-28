// Hover xem danh sách người đã thả cảm xúc cho bài đăng (Vibe Bar Bento Card) và bình luận (Mini-Popover).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import ErrorRetry from './ErrorRetry.jsx';
import { MutualBadge } from './FollowButton.jsx';
import { REACTION_MAP, sortedReactionEntries, topReactionEmojis } from './ReactionPicker.jsx';
import { api } from '../lib/api.js';
import { errorMessage } from '../lib/errors.js';

const OPEN_DELAY_MS = 180;
const CLOSE_DELAY_MS = 140;

/**
 * Tải lười danh sách người thả cảm xúc khi hover hoặc bấm, có cache theo chữ ký dữ liệu.
 */
function useLazyReactionUsers(endpoint, signature) {
  const wrapRef = useRef(null);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);
  const fetchedSig = useRef('');

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const load = useCallback(async (force = false) => {
    if (!force && fetchedSig.current === signature && data) return;
    setLoading(true);
    setError('');
    try {
      const res = await api(endpoint);
      fetchedSig.current = signature;
      setData(res);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [endpoint, signature, data]);

  useEffect(() => {
    if (open && fetchedSig.current !== signature) {
      load(true);
    }
  }, [open, signature, load]);

  useEffect(() => () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onEnter = () => {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => {
      setOpen(true);
      load(false);
    }, OPEN_DELAY_MS);
  };

  const onLeave = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  const toggle = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    setOpen((cur) => {
      const next = !cur;
      if (next) load(false);
      return next;
    });
  };

  return { wrapRef, open, setOpen, loading, error, data, load, onEnter, onLeave, toggle };
}

function PopoverSkeleton({ rows = 3 }) {
  return (
    <div className="py-1" role="status" aria-label="Đang tải danh sách cảm xúc…">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="d-flex align-items-center gap-2 py-1">
          <span className="ui-skeleton ui-skeleton-circle flex-shrink-0" style={{ width: 26, height: 26 }} />
          <span className="ui-skeleton flex-grow-1" style={{ height: 12, width: `${70 - i * 12}%` }} />
        </div>
      ))}
    </div>
  );
}

/**
 * Thẻ nổi Bento cho bài đăng (Ý tưởng A):
 * - Thanh tỷ lệ màu Vibe Bar theo từng cảm xúc.
 * - Chip lọc chỉ cần rê chuột qua (hover-to-filter).
 * - Danh sách người thả ưu tiên Mutual lên đầu, avatar có đính icon cảm xúc ở góc.
 */
export function PostReactionsPopover({ postId, totalCount, reactionCounts = {}, myReaction = null }) {
  const sig = `${totalCount}:${myReaction ?? ''}:${JSON.stringify(reactionCounts ?? {})}`;
  const state = useLazyReactionUsers(`/posts/${postId}/reactions`, sig);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!state.open) setFilter('all');
  }, [state.open]);

  const counts = state.data?.reaction_counts ?? reactionCounts;
  const total = state.data?.total ?? totalCount;
  const entries = useMemo(() => sortedReactionEntries(counts), [counts]);
  const emojis = useMemo(() => {
    const top = topReactionEmojis(counts);
    return top.length ? top : ['❤️'];
  }, [counts]);

  const items = state.data?.items ?? [];
  const filteredItems = useMemo(
    () => (filter === 'all' ? items : items.filter((u) => u.reaction === filter)),
    [items, filter],
  );

  // Nếu filter hiện tại không còn mục nào sau khi cập nhật, quay về 'all'
  useEffect(() => {
    if (filter !== 'all' && !entries.some((e) => e.type === filter)) {
      setFilter('all');
    }
  }, [filter, entries]);

  if (!totalCount) return null;

  return (
    <div
      ref={state.wrapRef}
      className="soc-react-pop-wrap"
      onMouseEnter={state.onEnter}
      onMouseLeave={state.onLeave}
    >
      <button
        type="button"
        className="soc-post-react-pill"
        onClick={state.toggle}
        aria-expanded={state.open}
        aria-label={`Xem ${totalCount} người đã thả cảm xúc`}
      >
        <span className="soc-post-react-emojis" aria-hidden="true">{emojis.join('')}</span>
        <span>{totalCount}</span>
      </button>

      {state.open && (
        <div className="soc-bento-bridge">
          <div className="soc-bento-popover" role="dialog" aria-label="Cảm xúc bài viết">
            <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
              <span className="soc-bento-title">Cảm xúc bài viết</span>
              <span className="small text-body-secondary">{total} lượt</span>
            </div>

            {entries.length > 0 && total > 0 && (
              <>
                <div className="soc-vibe-bar mb-2" aria-hidden="true">
                  {entries.map((r) => (
                    <span
                      key={r.type}
                      className={`soc-vibe-seg${filter !== 'all' && filter !== r.type ? ' is-dim' : ''}`}
                      style={{ width: `${(r.count / total) * 100}%`, backgroundColor: r.barColor }}
                      title={`${r.label}: ${r.count}`}
                    />
                  ))}
                </div>

                <div className="soc-bento-chips mb-2" role="tablist" aria-label="Lọc theo cảm xúc">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filter === 'all'}
                    className={`soc-bento-chip${filter === 'all' ? ' is-active' : ''}`}
                    onMouseEnter={() => setFilter('all')}
                    onClick={() => setFilter('all')}
                  >
                    Tất cả {total}
                  </button>
                  {entries.map((r) => (
                    <button
                      key={r.type}
                      type="button"
                      role="tab"
                      aria-selected={filter === r.type}
                      className={`soc-bento-chip${filter === r.type ? ' is-active' : ''}`}
                      onMouseEnter={() => setFilter(r.type)}
                      onClick={() => setFilter(r.type)}
                      title={r.label}
                    >
                      <span aria-hidden="true">{r.emoji}</span>
                      <span>{r.count}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="soc-bento-list">
              {state.loading && !state.data && <PopoverSkeleton rows={3} />}
              {state.error && !state.loading && (
                <ErrorRetry message={state.error} onRetry={() => state.load(true)} />
              )}
              {!state.loading && !state.error && filteredItems.length === 0 && (
                <p className="small text-body-secondary mb-0 py-1">Chưa có người thả cảm xúc này.</p>
              )}
              {filteredItems.map((u) => {
                const reactInfo = REACTION_MAP[u.reaction] ?? REACTION_MAP.love;
                return (
                  <Link
                    key={u.id}
                    to={`/u/${u.id}`}
                    className="soc-bento-row"
                    onClick={() => state.setOpen(false)}
                  >
                    <span className="soc-avatar-react-wrap">
                      <Avatar src={u.avatar_url} name={u.full_name} size={32} decorative />
                      <span className="soc-avatar-react-badge" aria-hidden="true">{reactInfo.emoji}</span>
                    </span>
                    <span className="soc-bento-row-info">
                      <span className="soc-bento-row-name text-truncate">{u.full_name}</span>
                      {u.major && <span className="soc-bento-row-sub text-truncate">{u.major}</span>}
                    </span>
                    {u.is_mutual && <MutualBadge className="flex-shrink-0 ms-auto" />}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Mini-Popover nhỏ gọn một bên cho danh sách người thả cảm xúc ở bình luận.
 */
export function CommentReactionsPopover({ postId, commentId, totalCount, reactionCounts = {}, myReaction = null }) {
  const sig = `${totalCount}:${myReaction ?? ''}:${JSON.stringify(reactionCounts ?? {})}`;
  const state = useLazyReactionUsers(`/posts/${postId}/comments/${commentId}/reactions`, sig);
  const emojis = useMemo(() => {
    const top = topReactionEmojis(reactionCounts);
    return top.length ? top : ['👍'];
  }, [reactionCounts]);

  if (!totalCount) return null;

  const items = state.data?.items ?? [];

  return (
    <div
      ref={state.wrapRef}
      className="soc-react-pop-wrap"
      onMouseEnter={state.onEnter}
      onMouseLeave={state.onLeave}
    >
      <button
        type="button"
        className="soc-react-summary"
        onClick={state.toggle}
        aria-expanded={state.open}
        aria-label={`${totalCount} cảm xúc — xem danh sách`}
      >
        <span aria-hidden="true">{emojis.join('')}</span>
        <span>{totalCount}</span>
      </button>

      {state.open && (
        <div className="soc-cmt-pop-bridge">
          <div className="soc-cmt-react-popover" role="dialog" aria-label="Người đã thả cảm xúc">
            <div className="soc-cmt-pop-title">Cảm xúc ({state.data?.total ?? totalCount})</div>
            <div className="soc-cmt-react-list">
              {state.loading && !state.data && <PopoverSkeleton rows={2} />}
              {state.error && !state.loading && (
                <ErrorRetry message={state.error} onRetry={() => state.load(true)} />
              )}
              {items.map((u) => {
                const reactInfo = REACTION_MAP[u.reaction] ?? REACTION_MAP.like;
                return (
                  <Link
                    key={u.id}
                    to={`/u/${u.id}`}
                    className="soc-cmt-react-row"
                    onClick={() => state.setOpen(false)}
                  >
                    <Avatar src={u.avatar_url} name={u.full_name} size={22} decorative />
                    <span className="text-truncate flex-grow-1">{u.full_name}</span>
                    {u.is_mutual && <span className="soc-cmt-mutual-tag">Mutual</span>}
                    <span className="soc-cmt-react-emoji" aria-label={reactInfo.label} title={reactInfo.label}>
                      {reactInfo.emoji}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
