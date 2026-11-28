// Danh sách bình luận 2 cấp giống Facebook (ẩn/hiện bình luận con), trả lời ngay dưới bình luận, cảm xúc, sửa và xóa (FR-SOC-03) – phụ trách: Đức Huy (dhuyy-06).
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Card, Form, Modal } from 'react-bootstrap';
import AsyncState from './AsyncState.jsx';
import Avatar from './Avatar.jsx';
import CommentItem from './CommentItem.jsx';
import ErrorAlert from './ErrorAlert.jsx';
import LoadMore from './LoadMore.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import usePagedList from '../hooks/usePagedList.js';
import { api } from '../lib/api.js';
import '../styles/social.css';

const COMMENTS_LIMIT = 50;
const MAX_COMMENT = 2000;
const SKELETON_ROWS = 3;

function CommentsSkeleton() {
  return (
    <div role="status">
      <span className="visually-hidden">Đang tải bình luận…</span>
      <div aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <div key={i} className="soc-comment-row py-2 d-flex align-items-start gap-2 gap-sm-3">
            <span className="ui-skeleton ui-skeleton-circle flex-shrink-0" style={{ width: 34, height: 34 }} />
            <div className="flex-grow-1">
              <span className="ui-skeleton mb-2" style={{ height: 13, width: i === 1 ? '32%' : '42%' }} />
              <span className="ui-skeleton mb-1" style={{ height: 13, width: '85%' }} />
              <span className="ui-skeleton" style={{ height: 13, width: '55%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Dựng cây bình luận đúng 2 cấp giống Facebook:
 * - Cấp 0: bình luận gốc (`parent_id === null`).
 * - Cấp 1: toàn bộ phản hồi thuộc về bình luận gốc đó (kể cả khi reply lại một bình luận con khác).
 */
function buildTwoLevelTree(items) {
  const byId = new Map();
  for (const item of items) byId.set(item.id, item);

  const findRootId = (item) => {
    let cur = item;
    const seen = new Set([cur.id]);
    while (cur.parent_id && byId.has(cur.parent_id) && !seen.has(cur.parent_id)) {
      cur = byId.get(cur.parent_id);
      seen.add(cur.id);
    }
    return cur.id;
  };

  const roots = [];
  const rootMap = new Map();
  for (const item of items) {
    const rootId = findRootId(item);
    if (rootId === item.id) {
      const node = { ...item, rootId: item.id, children: [] };
      roots.push(node);
      rootMap.set(item.id, node);
    }
  }

  for (const item of items) {
    const rootId = findRootId(item);
    if (rootId !== item.id) {
      const parentNode = rootMap.get(rootId);
      if (parentNode) {
        parentNode.children.push({ ...item, rootId });
      }
    }
  }
  return roots;
}

/** Gom ID của một bình luận và toàn bộ các bình luận con/cháu bên dưới (để đồng bộ khi xóa cascade). */
function collectSubtreeIds(items, rootId) {
  const removed = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of items) {
      if (c.parent_id && removed.has(c.parent_id) && !removed.has(c.id)) {
        removed.add(c.id);
        changed = true;
      }
    }
  }
  return removed;
}

/**
 * @param {object} props
 * @param {string} props.postId
 * @param {number} props.commentCount
 * @param {(delta: number) => void} [props.onCountChange]
 * @param {(text: string, variant?: 'edit' | 'delete') => void} [props.onToast]
 * @param {import('react').RefObject<HTMLTextAreaElement | null>} [props.inputRef]
 */
export default function CommentSection({ postId, commentCount, onCountChange, onToast, inputRef }) {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const myName = profile?.full_name || user?.user_metadata?.full_name || 'Bạn';

  const [sort, setSort] = useState('oldest');

  const list = usePagedList(
    (page) => api(`/posts/${postId}/comments?page=${page}&limit=${COMMENTS_LIMIT}&sort=${sort}`),
    [postId, sort],
  );

  // Form bình luận gốc ở đầu mục
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState('');

  // Trạng thái mở/ẩn nhánh phản hồi của từng bình luận gốc (`{ [rootId]: true }`)
  const [expandedRoots, setExpandedRoots] = useState({});

  // Form trả lời ngay dưới bình luận cha (`rootId` là bình luận cấp 0 để giữ cây luôn 2 cấp)
  const [replyTo, setReplyTo] = useState(null); // { rootId, targetId, authorName }
  const [replyDraft, setReplyDraft] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyErr, setReplyErr] = useState('');
  const replyTextareaRef = useRef(null);

  // Cảm xúc bình luận
  const [openPickerId, setOpenPickerId] = useState(null);
  const [reactBusyId, setReactBusyId] = useState(null);
  const [reactErr, setReactErr] = useState('');

  // State sửa bình luận (popup sửa riêng + popup xác nhận)
  const [editingComment, setEditingComment] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState('');

  // State xóa bình luận
  const [targetDelete, setTargetDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');

  const inputId = useId();
  const editTextareaId = useId();
  const headingId = useId();
  const sortSelectId = useId();
  const menuBaseId = useId();

  useEffect(() => {
    if (replyTo && replyTextareaRef.current) {
      replyTextareaRef.current.focus({ preventScroll: false });
    }
  }, [replyTo]);

  // Đóng thanh chọn cảm xúc và đặt lại thứ tự lọc khi đổi bài đăng
  useEffect(() => {
    setSort('oldest');
    setExpandedRoots({});
    setReplyTo(null);
    setOpenPickerId(null);
    setReactErr('');
  }, [postId]);

  const commentTree = useMemo(() => buildTwoLevelTree(list.items), [list.items]);

  function handleSortChange(nextSort) {
    setSort(nextSort);
    setExpandedRoots({});
    setReplyTo(null);
    setOpenPickerId(null);
  }

  async function submitRootComment(e) {
    e?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || submitting) {
      if (!trimmed) setSubmitErr('Vui lòng nhập nội dung bình luận.');
      return;
    }

    setSubmitErr('');
    setSubmitting(true);
    try {
      const created = await api(`/posts/${postId}/comments`, {
        method: 'POST',
        body: { content: trimmed },
      });
      list.setItems((cur) => {
        if (cur.some((x) => x.id === created.id)) return cur;
        return sort === 'newest' ? [created, ...cur] : [...cur, created];
      });
      setDraft('');
      onCountChange?.(1);
      onToast?.('Đã gửi bình luận', 'edit');
    } catch (ex) {
      setSubmitErr(ex);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleExpandReplies(rootId) {
    setExpandedRoots((cur) => ({ ...cur, [rootId]: !cur[rootId] }));
  }

  function openInlineReply(comment, authorName) {
    const rootId = comment.rootId ?? comment.id;
    // Tự động mở rộng nhánh phản hồi của bình luận gốc để hiện khung nhập ngay bên dưới
    setExpandedRoots((cur) => ({ ...cur, [rootId]: true }));

    if (replyTo?.rootId === rootId && replyTo?.targetId === comment.id) {
      replyTextareaRef.current?.focus();
      return;
    }
    setReplyTo({ rootId, targetId: comment.id, authorName });
    setReplyDraft(`@${authorName} `);
    setReplyErr('');
  }

  function closeInlineReply() {
    if (replyBusy) return;
    setReplyTo(null);
    setReplyDraft('');
    setReplyErr('');
  }

  async function submitReplyComment(e) {
    e?.preventDefault();
    if (!replyTo || replyBusy) return;
    const trimmed = replyDraft.trim();
    if (!trimmed) {
      setReplyErr('Vui lòng nhập nội dung phản hồi.');
      return;
    }

    setReplyErr('');
    setReplyBusy(true);
    try {
      // Luôn gắn parent_id về bình luận gốc (cấp 0) để cấu trúc cây giữ đúng 2 cấp như Facebook
      const created = await api(`/posts/${postId}/comments`, {
        method: 'POST',
        body: { content: trimmed, parent_id: replyTo.rootId },
      });
      list.setItems((cur) => (cur.some((x) => x.id === created.id) ? cur : [...cur, created]));
      setExpandedRoots((cur) => ({ ...cur, [replyTo.rootId]: true }));
      setReplyTo(null);
      setReplyDraft('');
      onCountChange?.(1);
      onToast?.('Đã gửi phản hồi', 'edit');
    } catch (ex) {
      setReplyErr(ex);
    } finally {
      setReplyBusy(false);
    }
  }

  async function handleReaction(comment, reactionType) {
    if (reactBusyId) return;
    setReactErr('');
    setOpenPickerId(null);
    setReactBusyId(comment.id);
    try {
      const removing = reactionType === null || comment.my_reaction === reactionType;
      const res = removing
        ? await api(`/posts/${postId}/comments/${comment.id}/reaction`, { method: 'DELETE' })
        : await api(`/posts/${postId}/comments/${comment.id}/reaction`, {
            method: 'PUT',
            body: { reaction: reactionType },
          });

      list.setItems((cur) =>
        cur.map((x) => (x.id === comment.id ? {
          ...x,
          my_reaction: res.my_reaction,
          reaction_count: res.reaction_count,
          reaction_counts: res.reaction_counts,
        } : x)),
      );
    } catch (ex) {
      setReactErr(ex);
    } finally {
      setReactBusyId(null);
    }
  }

  function startEditComment(comment) {
    setEditingComment(comment);
    setEditContent(comment.content);
    setEditErr('');
    setShowEditConfirm(false);
    setShowEditModal(true);
  }

  function cancelEditComment() {
    if (editBusy) return;
    setShowEditConfirm(false);
    setShowEditModal(false);
    setEditingComment(null);
    setEditErr('');
  }

  function backToEditCommentModal() {
    if (editBusy) return;
    setShowEditConfirm(false);
    setShowEditModal(true);
  }

  function requestSaveEditComment(e) {
    e.preventDefault();
    const trimmed = editContent.trim();
    if (!trimmed) {
      setEditErr('Nội dung bình luận không được trống.');
      return;
    }
    setEditErr('');
    setShowEditModal(false);
    setShowEditConfirm(true);
  }

  async function confirmSaveEditComment() {
    if (!editingComment || editBusy) return;
    const trimmed = editContent.trim();
    if (!trimmed) {
      setShowEditConfirm(false);
      setShowEditModal(true);
      setEditErr('Nội dung bình luận không được trống.');
      return;
    }

    setEditErr('');
    setEditBusy(true);
    try {
      const updated = await api(`/posts/${postId}/comments/${editingComment.id}`, {
        method: 'PATCH',
        body: { content: trimmed },
      });
      list.setItems((cur) => cur.map((x) => (x.id === updated.id ? updated : x)));
      setShowEditConfirm(false);
      setShowEditModal(false);
      setEditingComment(null);
      onToast?.('Đã sửa bình luận thành công', 'edit');
    } catch (ex) {
      setEditErr(ex);
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmDeleteComment() {
    if (!targetDelete || deleting) return;
    setDeleteErr('');
    setDeleting(true);
    try {
      await api(`/posts/${postId}/comments/${targetDelete.id}`, { method: 'DELETE' });
      const deletedId = targetDelete.id;
      const removedIds = collectSubtreeIds(list.items, deletedId);
      list.setItems((cur) => cur.filter((x) => !removedIds.has(x.id)));
      if (replyTo && (removedIds.has(replyTo.rootId) || removedIds.has(replyTo.targetId))) {
        closeInlineReply();
      }
      setTargetDelete(null);
      onCountChange?.(-removedIds.size);
      onToast?.('Đã xóa bình luận thành công', 'delete');
    } catch (ex) {
      setDeleteErr(ex);
    } finally {
      setDeleting(false);
    }
  }

  function renderCommentItem(comment, isReply = false) {
    return (
      <CommentItem
        comment={comment}
        isReply={isReply}
        currentUserId={user?.id}
        isAdmin={isAdmin}
        menuId={`${menuBaseId}-${comment.id}`}
        isPickerOpen={openPickerId === comment.id}
        isReactBusy={reactBusyId === comment.id}
        onOpenPicker={() => setOpenPickerId(comment.id)}
        onClosePicker={() => setOpenPickerId((cur) => (cur === comment.id ? null : cur))}
        onTogglePicker={() => setOpenPickerId((cur) => (cur === comment.id ? null : comment.id))}
        onReaction={handleReaction}
        onReply={openInlineReply}
        onEdit={startEditComment}
        onDelete={(target) => { setDeleteErr(''); setTargetDelete(target); }}
      />
    );
  }

  const isSubmitKey = (e) =>
    e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.nativeEvent?.isComposing;

  function renderRootThread(rootNode) {
    const childCount = rootNode.children.length;
    const isExpanded = Boolean(expandedRoots[rootNode.id]);
    const isReplyingThisRoot = replyTo?.rootId === rootNode.id;
    const showBranchContainer = (childCount > 0 && isExpanded) || isReplyingThisRoot;

    return (
      <div key={rootNode.id} className="soc-tree-node soc-tree-root">
        {renderCommentItem(rootNode, false)}

        {childCount > 0 && !isExpanded && (
          <div className="soc-tree-children">
            <div className="soc-tree-node">
              <button
                type="button"
                className="soc-replies-toggle"
                onClick={() => toggleExpandReplies(rootNode.id)}
              >
                Xem {childCount} phản hồi
              </button>
            </div>
          </div>
        )}

        {showBranchContainer && (
          <div className="soc-tree-children">
            {isExpanded &&
              rootNode.children.map((child) => (
                <div key={child.id} className="soc-tree-node">
                  {renderCommentItem(child, true)}
                </div>
              ))}

            {isReplyingThisRoot && (
              <div className="soc-tree-node">
                <Form onSubmit={submitReplyComment} noValidate className="soc-inline-reply">
                  <div className="d-flex align-items-start gap-2">
                    <Avatar src={profile?.avatar_url} name={myName} size={28} decorative />
                    <div className="flex-grow-1" style={{ minWidth: 0 }}>
                      <div className="small text-body-secondary mb-1">
                        Trả lời <strong>{replyTo.authorName}</strong>
                      </div>
                      <Form.Label htmlFor={`${inputId}-reply`} className="visually-hidden">
                        Trả lời {replyTo.authorName}
                      </Form.Label>
                      <Form.Control
                        ref={replyTextareaRef}
                        id={`${inputId}-reply`}
                        as="textarea"
                        rows={2}
                        className="soc-textarea-fixed"
                        value={replyDraft}
                        onChange={(e) => { setReplyDraft(e.target.value); if (replyErr) setReplyErr(''); }}
                        onKeyDown={(e) => {
                          if (isSubmitKey(e)) {
                            e.preventDefault();
                            submitReplyComment();
                          } else if (e.key === 'Escape') {
                            closeInlineReply();
                          }
                        }}
                        maxLength={MAX_COMMENT}
                        placeholder={`Trả lời ${replyTo.authorName}…`}
                        disabled={replyBusy}
                      />
                      <ErrorAlert error={replyErr} onClose={() => setReplyErr('')} className="mt-2 mb-0" />
                      <div className="d-flex justify-content-end gap-2 mt-2">
                        <Button type="button" variant="outline-secondary" size="sm" disabled={replyBusy} onClick={closeInlineReply}>
                          Hủy
                        </Button>
                        <Button type="submit" size="sm" disabled={replyBusy || !replyDraft.trim()}>
                          {replyBusy ? <LoadingSpinner inline label="Đang gửi…" /> : 'Gửi phản hồi'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Form>
              </div>
            )}

            {childCount > 0 && isExpanded && (
              <div className="soc-tree-node">
                <button
                  type="button"
                  className="soc-replies-toggle"
                  onClick={() => toggleExpandReplies(rootNode.id)}
                >
                  Ẩn phản hồi
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <Card body className="soc-post-card soc-comment-card">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
          <h2 id={headingId} className="h5 mb-0">
            Bình luận ({commentCount})
          </h2>
          <Form.Select
            id={sortSelectId}
            size="sm"
            value={sort}
            onChange={(e) => {
              handleSortChange(e.target.value);
              e.currentTarget.blur();
            }}
            aria-label="Sắp xếp bình luận"
            className="w-auto"
          >
            <option value="oldest">Cũ nhất</option>
            <option value="newest">Mới nhất</option>
          </Form.Select>
        </div>

        <Form onSubmit={submitRootComment} noValidate className="mb-3">
          <div className="d-flex align-items-start gap-2 gap-sm-3">
            <Avatar src={profile?.avatar_url} name={myName} size={36} decorative />
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <Form.Label htmlFor={inputId} className="visually-hidden">Viết bình luận</Form.Label>
              <Form.Control
                ref={inputRef}
                id={inputId}
                as="textarea"
                rows={2}
                className="soc-textarea-fixed"
                value={draft}
                onChange={(e) => { setDraft(e.target.value); if (submitErr) setSubmitErr(''); }}
                onKeyDown={(e) => {
                  if (isSubmitKey(e)) {
                    e.preventDefault();
                    submitRootComment();
                  }
                }}
                maxLength={MAX_COMMENT}
                placeholder="Viết bình luận của bạn…"
                disabled={submitting}
              />
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-2">
                <span className="small text-body-secondary">
                  {draft.length}/{MAX_COMMENT}
                </span>
                <Button type="submit" size="sm" disabled={submitting || !draft.trim()}>
                  {submitting ? <LoadingSpinner inline label="Đang gửi…" /> : 'Gửi bình luận'}
                </Button>
              </div>
            </div>
          </div>
          <ErrorAlert error={submitErr} title="Chưa gửi được bình luận" onClose={() => setSubmitErr('')} className="mt-2 mb-0" />
        </Form>

        <ErrorAlert error={reactErr} onClose={() => setReactErr('')} className="mb-2" />

        {list.loading ? (
          <CommentsSkeleton />
        ) : (
          <AsyncState
            loading={false}
            error={list.error}
            empty={list.items.length === 0}
            onRetry={list.retry}
            errorTitle="Không tải được bình luận"
            emptyTitle="Chưa có bình luận nào"
            emptyMessage="Hãy là người đầu tiên bình luận về bài viết này."
          >
            <div className="soc-comment-tree">
              {commentTree.map((rootNode) => renderRootThread(rootNode))}
            </div>
            <LoadMore
              hasMore={list.hasMore}
              loading={list.loadingMore}
              onLoadMore={list.loadMore}
              endLabel={list.items.length > 0 ? 'Đã hiển thị tất cả bình luận.' : ''}
            />
          </AsyncState>
        )}
      </Card>

      <Modal show={showEditModal} onHide={cancelEditComment} centered>
        <Modal.Header closeButton={!editBusy} closeLabel="Đóng">
          <Modal.Title className="h5">Chỉnh sửa bình luận</Modal.Title>
        </Modal.Header>
        <Form onSubmit={requestSaveEditComment} noValidate>
          <Modal.Body>
            <Form.Label htmlFor={editTextareaId} className="visually-hidden">Chỉnh sửa nội dung bình luận</Form.Label>
            <Form.Control
              id={editTextareaId}
              as="textarea"
              rows={3}
              className="soc-textarea-fixed"
              value={editContent}
              onChange={(e) => { setEditContent(e.target.value); if (editErr) setEditErr(''); }}
              maxLength={MAX_COMMENT}
              disabled={editBusy}
            />
            <div className="text-end small text-body-secondary mt-1">
              {editContent.length}/{MAX_COMMENT}
            </div>
            <ErrorAlert error={editErr} title="Chưa lưu được bình luận" onClose={() => setEditErr('')} className="mt-2 mb-0" />
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" variant="outline-secondary" disabled={editBusy} onClick={cancelEditComment}>
              Hủy
            </Button>
            <Button type="submit" disabled={editBusy || !editContent.trim()}>
              Lưu thay đổi
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showEditConfirm} onHide={backToEditCommentModal} centered>
        <Modal.Header closeButton={!editBusy} closeLabel="Đóng">
          <Modal.Title className="h5">Xác nhận chỉnh sửa bình luận?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">Nội dung bình luận mới sẽ được cập nhật.</p>
          <ErrorAlert error={editErr} title="Chưa lưu được bình luận" onClose={() => setEditErr('')} className="mb-0" />
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" disabled={editBusy} onClick={backToEditCommentModal}>
            Hủy
          </Button>
          <Button type="button" variant="primary" disabled={editBusy} onClick={confirmSaveEditComment}>
            {editBusy ? <LoadingSpinner inline label="Đang lưu…" /> : 'Xác nhận lưu'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={Boolean(targetDelete)} onHide={() => !deleting && setTargetDelete(null)} centered>
        <Modal.Header closeButton={!deleting} closeLabel="Đóng">
          <Modal.Title className="h5">Xóa bình luận?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">Bình luận này (và các phản hồi bên dưới nếu có) sẽ bị xóa vĩnh viễn.</p>
          <ErrorAlert error={deleteErr} title="Chưa xóa được bình luận" onClose={() => setDeleteErr('')} className="mb-0" />
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" disabled={deleting} onClick={() => setTargetDelete(null)}>
            Hủy
          </Button>
          <Button type="button" variant="danger" disabled={deleting} onClick={confirmDeleteComment}>
            {deleting ? <LoadingSpinner inline label="Đang xóa…" /> : 'Xóa bình luận'}
          </Button>
        </Modal.Footer>
      </Modal>
    </section>
  );
}
