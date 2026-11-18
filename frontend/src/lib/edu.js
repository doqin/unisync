// Cùng mẫu với backend/src/lib/edu.js
export const isEduVnEmail = (email) => /^[^@\s]+@([a-z0-9-]+\.)+edu\.vn$/i.test(email.trim());
