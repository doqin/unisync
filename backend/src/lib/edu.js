// Mẫu `@*.edu.vn` (FR-AUTH-01). Phải khớp với trigger enforce_edu_vn_email trong 0001_schema.sql.
export const EDU_VN_RE = /^[^@\s]+@([a-z0-9-]+\.)+edu\.vn$/i;
export const isEduVnEmail = (email) => EDU_VN_RE.test(email);
