import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null); // hồ sơ của người đang đăng nhập (avatar_url là signed URL)
  const userId = session?.user?.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Ảnh đại diện chỉ để trang trí: lỗi tải hồ sơ thì thanh điều hướng hiện chữ cái đầu / biểu tượng thay thế.
  // Signed URL sống 1 giờ nên làm mới sau 45 phút.
  useEffect(() => {
    if (!userId) { setProfile(null); return undefined; }
    let alive = true;
    const load = () => api('/me').then((me) => alive && setProfile(me.profile)).catch(() => {});
    load();
    const timer = setInterval(load, 45 * 60 * 1000);
    return () => { alive = false; clearInterval(timer); };
  }, [userId]);

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    loading,
    profile,
    setProfile,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  }), [session, loading, profile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
