import { useCallback, useEffect, useRef, useState } from 'react';

const INITIAL = { items: [], page: 0, hasMore: false, loading: true, loadingMore: false, error: null };

/**
 * Danh sách phân trang kiểu "Tải thêm" dùng chung (NFR-07) – phụ trách: Minh Trọng.
 * Khớp quy ước API của backend: GET ...?page=N → { items: [...], page, has_more }.
 *
 *   const list = usePagedList((page) => api(`/documents?page=${page}&q=${q}`), [q]);
 *   <AsyncState loading={list.loading} error={list.error} empty={list.items.length === 0} onRetry={list.retry}>
 *     {list.items.map(...)}
 *     <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onLoadMore={list.loadMore} />
 *   </AsyncState>
 *
 * - Đổi `deps` (bộ lọc, từ khóa…) → tải lại từ trang 1, bỏ kết quả của yêu cầu cũ.
 * - Lỗi khi tải thêm vẫn giữ các mục đã có; `retry` tải lại đúng trang bị lỗi.
 *
 * @template T
 * @param {(page: number) => Promise<{ items: T[], has_more?: boolean }>} fetchPage
 * @param {import('react').DependencyList} [deps=[]]
 */
export default function usePagedList(fetchPage, deps = []) {
  const [state, setState] = useState(INITIAL);
  const fetchRef = useRef(fetchPage);
  const stateRef = useRef(state);
  const requestId = useRef(0);

  // Luôn dùng hàm fetch và state mới nhất mà không phải đưa vào deps.
  useEffect(() => {
    fetchRef.current = fetchPage;
    stateRef.current = state;
  });

  const run = useCallback(async (page) => {
    const id = ++requestId.current;
    const append = page > 1;
    setState((s) => (append ? { ...s, loadingMore: true, error: null } : INITIAL));
    try {
      const res = await fetchRef.current(page);
      if (id !== requestId.current) return;
      const items = Array.isArray(res?.items) ? res.items : [];
      setState((s) => ({
        ...s,
        items: append ? [...s.items, ...items] : items,
        page,
        hasMore: Boolean(res?.has_more),
        loading: false,
        loadingMore: false,
      }));
    } catch (error) {
      if (id !== requestId.current) return;
      setState((s) => ({ ...s, error, loading: false, loadingMore: false }));
    }
  }, []);

  useEffect(() => {
    run(1);
    return () => { requestId.current += 1; }; // rời trang hoặc đổi bộ lọc: bỏ qua kết quả đang chờ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (s.loading || s.loadingMore || !s.hasMore) return;
    run(s.page + 1);
  }, [run]);

  const reload = useCallback(() => run(1), [run]);

  /** Chưa tải được trang nào → tải lại từ đầu; ngược lại tải lại trang kế tiếp. */
  const retry = useCallback(() => {
    const s = stateRef.current;
    if (s.page === 0) run(1);
    else run(s.page + 1);
  }, [run]);

  /** Sửa danh sách tại chỗ, ví dụ xóa một mục sau khi gọi API thành công. */
  const setItems = useCallback((updater) => {
    setState((s) => ({ ...s, items: typeof updater === 'function' ? updater(s.items) : updater }));
  }, []);

  return { ...state, loadMore, reload, retry, setItems };
}
