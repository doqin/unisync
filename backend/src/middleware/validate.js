import { badRequest } from '../lib/errors.js';

/** validate({ body: zodSchema, query: zodSchema, params: zodSchema }) */
export const validate = (schemas) => (req, _res, next) => {
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const r = schemas[part].safeParse(req[part]);
    if (!r.success) return next(badRequest('Dữ liệu không hợp lệ', r.error.flatten()));
    if (part !== 'query') req[part] = r.data; // req.query là getter ở một số phiên bản Express
  }
  next();
};
