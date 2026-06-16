import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { ArrowRight, Lock } from 'lucide-react';
import { useAuth } from '../store/auth';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/timesheet" replace />;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/timesheet');
    } catch (err: any) {
      setError(err.message || 'Giriş başarısız');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
         style={{
           background: '#0B1224',
           backgroundImage:
             'radial-gradient(circle at 15% 30%, rgba(37,99,235,.32) 0%, transparent 45%),' +
             'radial-gradient(circle at 85% 70%, rgba(8,145,178,.25) 0%, transparent 45%),' +
             'radial-gradient(circle at 50% 100%, rgba(30,64,175,.22) 0%, transparent 50%)',
         }}>
      <div className="w-full max-w-md relative z-10">
        {/* TDev logosu — beyaz kutu içinde (logo koyu, kontrast için) */}
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-white rounded-xl px-3.5 py-2.5 flex items-center justify-center shadow-lg">
            <img src="/logo.png" alt="TDev Consulting" className="h-8 w-auto object-contain" />
          </div>
          <div className="pl-3 border-l border-white/15">
            <div className="text-[13px] font-bold text-white/90 leading-tight">Aktivite</div>
            <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Giriş Sistemi</div>
          </div>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-2 leading-tight">
          Hoş <span className="grad-text" style={{ backgroundSize: '200% 200%' }}>geldiniz</span>
        </h1>
        <p className="text-white/55 mb-8">Aktivitenizi kaydetmek bir tık kadar kolay.</p>

        <form onSubmit={submit} className="bg-white/[.04] border border-white/10 backdrop-blur-md rounded-2xl p-6 sm:p-7 space-y-4">
          {error && (
            <div className="bg-brand-rose/15 border border-brand-rose/30 text-[#FF9090] text-xs px-3 py-2.5 rounded-lg">
              {error}
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-wide mb-2">
              Kullanıcı adı
            </label>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-white/[.06] border border-white/10 rounded-xl px-3.5 py-3 text-white outline-none focus:border-brand-indigo focus:bg-brand-indigo/10 transition placeholder-white/20"
              placeholder="kullanici_adi"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-wide mb-2">
              Şifre
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/[.06] border border-white/10 rounded-xl px-3.5 py-3 text-white outline-none focus:border-brand-indigo focus:bg-brand-indigo/10 transition placeholder-white/20"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-grad-primary text-white font-bold rounded-xl py-3.5 mt-2 hover:-translate-y-0.5 shadow-glow hover:shadow-[0_12px_32px_rgba(37,99,235,.5)] transition-all flex items-center justify-center gap-2"
            style={{ backgroundSize: '200% 200%' }}
          >
            {loading ? 'Giriş yapılıyor...' : (<>Giriş Yap <ArrowRight size={16} /></>)}
          </button>
        </form>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-white/30 mt-5">
          <Lock size={11} />
          Hesabınız yoksa yöneticinizle iletişime geçin.
        </div>
      </div>
    </div>
  );
}
