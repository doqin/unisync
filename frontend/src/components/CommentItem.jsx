// Hiển thị một bình luận đơn lẻ (gốc hoặc phản hồi cấp 1) kèm menu sửa/xóa, cảm xúc và nút trả lời — phụ trách: Đức Huy (dhuyy-06).
import { Link } from 'react-router-dom';
import { Dropdown } from 'react-bootstrap';
import Avatar from './Avatar.jsx';
import ReactionPicker, { topReactionEmojis } from './ReactionPicker.jsx';
import { parseCommentSegments } from '../lib/mentions.js';
import { formatFullDateTime, formatRelativeTime } from '../lib/time.js';

/**
 * @param {object} props
 * @param {object} props.comment
 * @param {boolean} [props.isReply]
 * @param {Array<{ id: string, full_name: string }>} [props.knownUsers]
 * @param {string | undefined} props.currentUserId
 * @param {boolean} [props.isAdmin]
 * @param {string} props.menuId
 * @param {boolean} [props.isPickerOpen]
 * @param {boolean} [props.isReactBusy]
 * @param {() => void} props.onOpenPicker
 * @param {() => void} props.onClosePicker
 * @param {() => void} props.onTogglePicker
 * @param {(comment: object, reactionType: string | null) => void} props.onReaction
 * @param {(comment: object, authorName: string) => void} props.onReply
 * @param {(comment: object) => void} props.onEdit
 * @param {(comment: object) => void} props.onDelete
 */
export default function CommentItem({
  comment,
  isReply = false,
  knownUsers = [],
  currentUserId,
  isAdmin = false,
  menuId,
  isPickerOpen = false,
  isReactBusy = false,
  onOpenPicker,
  onClosePicker,
  onTogglePicker,
  onReaction,
  onReply,
  onEdit,
  onDelete,
}) {
  const authorId = comment.author?.id ?? comment.author_id;
  const authorName = comment.author?.full_name || 'Sinh viên';
  const isCommentAuthor = currentUserId === comment.author_id;
  const canDelete = isCommentAuthor || isAdmin;
  const emojis = topReactionEmojis(comment.reaction_counts);
  const totalReactions = comment.reaction_count ?? 0;

  return (
    <div className={`d-flex align-items-start gap-2${isReply ? ' soc-comment-row--reply' : ''}`}>
      <Link to={`/u/${authorId}`} className="text-decoration-none flex-shrink-0">
        <Avatar src={comment.author?.avatar_url} name={authorName} size={isReply ? 28 : 36} decorative />
      </Link>

      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <div className={`soc-comment-bubble${isReply ? ' soc-comment-bubble--reply' : ''}`}>
          <div className="d-flex justify-content-between align-items-start gap-2">
            <div style={{ minWidth: 0 }}>
              <Link to={`/u/${authorId}`} className="fw-semibold text-reset text-decoration-none text-break me-2">
                {authorName}
              </Link>
              <time
                dateTime={comment.created_at}
                title={formatFullDateTime(comment.created_at)}
                className="small text-body-secondary"
              >
                {formatRelativeTime(comment.created_at)}
              </time>
            </div>

            {(isCommentAuthor || canDelete) && (
              <Dropdown align="end" className="flex-shrink-0">
                <Dropdown.Toggle
                  id={menuId}
                  variant="outline-secondary"
                  size="sm"
                  className="soc-more-btn soc-more-btn--sm"
                  aria-label={`Tùy chọn bình luận của ${authorName}`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                  </svg>
                </Dropdown.Toggle>
                <Dropdown.Menu className="soc-more-menu">
                  {isCommentAuthor && (
                    <Dropdown.Item className="soc-menu-item" onClick={() => onEdit(comment)}>
                      Sửa bình luận
                    </Dropdown.Item>
                  )}
                  {canDelete && (
                    <Dropdown.Item
                      className="soc-menu-item soc-menu-item-danger"
                      onClick={() => onDelete(comment)}
                    >
                      Xóa bình luận
                    </Dropdown.Item>
                  )}
                </Dropdown.Menu>
              </Dropdown>
            )}
          </div>

          <p className="soc-comment-content mt-1 mb-0">
            {parseCommentSegments(comment.content, knownUsers).map((seg, idx) => (
              seg.type === 'mention' ? (
                <Link key={`${seg.userId}-${idx}`} to={`/u/${seg.userId}`} className="soc-mention-link">
                  @{seg.name}
                </Link>
              ) : (
                seg.text
              )
            ))}
          </p>
        </div>

        <div className="soc-comment-footer d-flex align-items-center justify-content-between flex-wrap gap-2 mt-1">
          <div className="d-flex align-items-center gap-2">
            <ReactionPicker
              myReaction={comment.my_reaction}
              busy={isReactBusy}
              isOpen={isPickerOpen}
              onOpen={onOpenPicker}
              onClose={onClosePicker}
              onToggleOpen={onTogglePicker}
              onSelect={(reactionType) => onReaction(comment, reactionType)}
            />

            <button
              type="button"
              className="soc-cmt-action-btn d-inline-flex align-items-center gap-1"
              onClick={() => onReply(comment, authorName)}
              aria-label={`Trả lời bình luận của ${authorName}`}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <polyline points="9 14 4 9 9 4" />
                <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
              </svg>
              <span>Trả lời</span>
            </button>
          </div>

          {totalReactions > 0 && (
            <span className="soc-react-summary" aria-label={`${totalReactions} cảm xúc`}>
              <span aria-hidden="true">{emojis.join('')}</span>
              <span>{totalReactions}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
