export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (m, d) => new HttpError(400, m, d);
export const unauthorized = (m = 'Chưa đăng nhập') => new HttpError(401, m);
export const forbidden = (m = 'Không có quyền thực hiện') => new HttpError(403, m);
export const notFound = (m = 'Không tìm thấy') => new HttpError(404, m);
