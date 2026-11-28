// Danh sách bài đăng trên trang hồ sơ (FR-PRO-03): mới nhất trước, "Tải thêm".
// Mỗi bài dùng PostCard của bảng tin (thích, sửa, xóa) nên hành vi giống nhau ở mọi nơi.
import AsyncState from './AsyncState.jsx';
import LoadMore from './LoadMore.jsx';
import PostCard from './PostCard.jsx';
import usePagedList from '../hooks/usePagedList.js';
import { api } from '../lib/api.js';

/** @param {{ userId: string, isSelf: boolean }} props */
export default function ProfilePosts({ userId, isSelf }) {
  const list = usePagedList((page) => api(`/profiles/${userId}/posts?page=${page}`), [userId]);
  const { setItems } = list;
  return (
    <section aria-labelledby="profile-posts-title">
      <h2 id="profile-posts-title" className="h5 mb-3">Bài đăng</h2>
      <AsyncState
        loading={list.loading} error={list.error} empty={list.items.length === 0} onRetry={list.retry}
        errorTitle="Không tải được bài đăng"
        emptyTitle="Chưa có bài đăng"
        emptyMessage={isSelf ? 'Bài bạn đăng sẽ hiện ở đây.' : 'Người này chưa có bài đăng nào bạn xem được.'}
      >
        {list.items.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            onUpdated={(updated) => setItems((cur) => cur.map((x) => (x.id === updated.id ? updated : x)))}
            onDeleted={(id) => setItems((cur) => cur.filter((x) => x.id !== id))}
          />
        ))}
        <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onLoadMore={list.loadMore} />
      </AsyncState>
    </section>
  );
}
