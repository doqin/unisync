// Tiện ích xử lý @mention trong bình luận (FR-SOC-03, FR-SOC-05): mã hóa token, tách liên kết hồ sơ, đặt caret và gợi ý Mutual.

const MENTION_TOKEN_SOURCE = '@\\[([^\\]\\n]+)\\]\\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\)';
const MAX_SUGGESTIONS = 6;

export function normalizeVi(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** Đặt focus và đưa con trỏ (caret) tới vị trí `pos` (mặc định cuối văn bản) sau khi DOM cập nhật. */
export function focusCaretAt(el, pos) {
  if (!el) return;
  const apply = () => {
    const len = el.value?.length ?? 0;
    const target = typeof pos === 'number' ? Math.max(0, Math.min(pos, len)) : len;
    try {
      el.setSelectionRange(target, target);
    } catch {
      // Bỏ qua nếu phần tử không hỗ trợ setSelectionRange
    }
  };
  el.focus({ preventScroll: false });
  apply();
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (document.activeElement === el) apply();
    });
  }
}

function dedupeUsers(users) {
  const byId = new Map();
  for (const u of users ?? []) {
    if (!u?.id || !u?.full_name) continue;
    const name = String(u.full_name).trim();
    if (name) byId.set(u.id, { id: u.id, full_name: name });
  }
  return [...byId.values()].sort((a, b) => b.full_name.length - a.full_name.length);
}

const isBeforeMentionBoundary = (text, index) => index === 0 || /[\s([,:;]/.test(text[index - 1]);
const isAfterMentionBoundary = (text, index) => index >= text.length || /[\s.,!?;:)\]]/.test(text[index]);

function replacePlainMentions(segment, sortedUsers) {
  if (!segment || !sortedUsers.length) return segment;
  let out = '';
  let i = 0;
  while (i < segment.length) {
    if (segment[i] === '@' && isBeforeMentionBoundary(segment, i)) {
      const rest = segment.slice(i + 1);
      const matched = sortedUsers.find(
        (u) => rest.startsWith(u.full_name) && isAfterMentionBoundary(rest, u.full_name.length),
      );
      if (matched) {
        out += `@[${matched.full_name}](${matched.id})`;
        i += 1 + matched.full_name.length;
        continue;
      }
    }
    out += segment[i];
    i += 1;
  }
  return out;
}

/** Chuyển các cụm `@Họ Tên` khớp `knownUsers` thành token `@[Họ Tên](user_id)` trước khi gửi lên API. */
export function encodeMentions(text, knownUsers = []) {
  const source = String(text ?? '');
  const sorted = dedupeUsers(knownUsers);
  if (!source || !sorted.length) return source;

  const tokenRe = new RegExp(MENTION_TOKEN_SOURCE, 'gi');
  let out = '';
  let lastIndex = 0;
  let m;
  while ((m = tokenRe.exec(source)) !== null) {
    if (m.index > lastIndex) {
      out += replacePlainMentions(source.slice(lastIndex, m.index), sorted);
    }
    out += m[0];
    lastIndex = tokenRe.lastIndex;
  }
  if (lastIndex < source.length) {
    out += replacePlainMentions(source.slice(lastIndex), sorted);
  }
  return out;
}

/** Tách nội dung bình luận thành danh sách các đoạn văn bản và mention sạch (giải mã token từ DB). */
export function decodeMentions(content) {
  const source = String(content ?? '');
  const tokenRe = new RegExp(MENTION_TOKEN_SOURCE, 'gi');
  const mentions = [];
  let text = '';
  let lastIndex = 0;
  let m;
  while ((m = tokenRe.exec(source)) !== null) {
    text += source.slice(lastIndex, m.index);
    const name = m[1];
    const id = m[2];
    text += `@${name}`;
    mentions.push({ id, full_name: name });
    lastIndex = tokenRe.lastIndex;
  }
  text += source.slice(lastIndex);
  return { text, mentions };
}

function splitPlainWithFallback(chunk, sortedUsers, out) {
  if (!chunk) return;
  if (!sortedUsers.length) {
    out.push({ type: 'text', text: chunk });
    return;
  }
  let textBuf = '';
  let i = 0;
  while (i < chunk.length) {
    if (chunk[i] === '@' && isBeforeMentionBoundary(chunk, i)) {
      const rest = chunk.slice(i + 1);
      const matched = sortedUsers.find(
        (u) => rest.startsWith(u.full_name) && isAfterMentionBoundary(rest, u.full_name.length),
      );
      if (matched) {
        if (textBuf) {
          out.push({ type: 'text', text: textBuf });
          textBuf = '';
        }
        out.push({ type: 'mention', name: matched.full_name, userId: matched.id });
        i += 1 + matched.full_name.length;
        continue;
      }
    }
    textBuf += chunk[i];
    i += 1;
  }
  if (textBuf) out.push({ type: 'text', text: textBuf });
}

/** Tách nội dung bình luận thành các đoạn `{ type: 'text', text }` và `{ type: 'mention', name, userId }`. */
export function parseCommentSegments(content, fallbackUsers = []) {
  const source = String(content ?? '');
  if (!source) return [];
  const sortedFallback = dedupeUsers(fallbackUsers);
  const tokenRe = new RegExp(MENTION_TOKEN_SOURCE, 'gi');
  const segments = [];
  let lastIndex = 0;
  let m;

  while ((m = tokenRe.exec(source)) !== null) {
    if (m.index > lastIndex) {
      splitPlainWithFallback(source.slice(lastIndex, m.index), sortedFallback, segments);
    }
    segments.push({ type: 'mention', name: m[1], userId: m[2] });
    lastIndex = tokenRe.lastIndex;
  }
  if (lastIndex < source.length) {
    splitPlainWithFallback(source.slice(lastIndex), sortedFallback, segments);
  }
  return segments;
}

/** Tìm truy vấn `@tên` đang gõ ngay trước con trỏ `caretPos` và lọc danh sách Mutual gợi ý. */
export function findActiveMentionQuery(text, caretPos, mutuals = []) {
  if (!Array.isArray(mutuals) || mutuals.length === 0 || typeof caretPos !== 'number') return null;
  const before = String(text ?? '').slice(0, caretPos);
  const match = /(?:^|[\s(])@([^@\n]{0,40})$/.exec(before);
  if (!match) return null;

  const rawQuery = match[1];
  const atIndex = before.lastIndexOf('@');
  if (atIndex < 0) return null;

  // Nếu sau `@` đã có đủ `<tên_mutual> ` ở đầu thì coi như đã gắn thẻ xong và đang gõ nội dung tiếp theo.
  const lowerRaw = rawQuery.toLowerCase();
  if (mutuals.some((u) => lowerRaw.startsWith(`${String(u.full_name ?? '').toLowerCase()} `))) {
    return null;
  }

  const q = normalizeVi(rawQuery);
  const items = mutuals
    .filter((u) => !q || normalizeVi(u.full_name).includes(q))
    .slice(0, MAX_SUGGESTIONS);
  if (!items.length) return null;

  return { atIndex, endIndex: caretPos, query: rawQuery, items };
}
