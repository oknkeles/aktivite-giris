import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Calendar, ArrowRight } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';

export default function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

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
           background: '#0E0B26',
           backgroundImage:
             'radial-gradient(circle at 15% 30%, rgba(168,85,247,.3) 0%, transparent 45%),' +
             'radial-gradient(circle at 85% 70%, rgba(236,72,153,.25) 0%, transparent 45%),' +
             'radial-gradient(circle at 50% 100%, rgba(99,102,241,.22) 0%, transparent 50%)',
         }}>
      <div className="w-full max-w-md relative z-10">
        <div className="inline-flex items-center gap-2.5 bg-white/[.06] border border-white/10 backdrop-blur-md rounded-full pl-2 pr-4 py-1.5 mb-6">
          <div className="w-7 h-7 rounded-full bg-grad-primary flex items-center justify-center shadow-glow">
            <Calendar size={14} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-xs font-semibold text-white/85">Aktivite Giriş Sistemi</span>
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
              placeholder="admin"
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
            className="w-full bg-grad-primary text-white font-bold rounded-xl py-3.5 mt-2 hover:-translate-y-0.5 shadow-glow hover:shadow-[0_12px_32px_rgba(168,85,247,.5)] transition-all flex items-center justify-center gap-2"
            style={{ backgroundSize: '200% 200%' }}
          >
            {loading ? 'Giriş yapılıyor...' : (<>Giriş Yap <ArrowRight size={16} /></>)}
          </button>
        </form>

        <div className="text-center text-xs text-white/30 mt-5">
          Yeni kullanıcı?{' '}
          <button onClick={() => setShowRegister(true)} className="text-white/60 border-b border-white/20 hover:text-white">
            Hesap oluştur
          </button>
        </div>
      </div>

      <RegisterModal open={showRegister} onClose={() => setShowRegister(false)} />
    </div>
  );
}

function RegisterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { register } = useAuth();
  const toast = useToast();
  const [u, setU] = useState('');
  const [f, setF] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    if (!u || !f || !p) return setErr('Tüm alanlar zorunlu.');
    try {
      await register(u, f, p);
      toast.show('Hesap oluşturuldu, giriş yapabilirsiniz.');
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Hata');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Hesap Oluştur"
      size="sm"
      footer={
        <>
          <button className="btn" onClick={onClose}>İptal</button>
          <button className="btn btn-primary" onClick={submit}>Oluştur</button>
        </>
      }
    >
      <div className="space-y-3">
        {err && <div className="bg-brand-rose/10 border border-brand-rose/30 text-brand-rose text-xs px-3 py-2 rounded-lg">{err}</div>}
        <div><label className="label">Kullanıcı adı</label><input className="input" value={u} onChange={(e) => setU(e.target.value)} /></div>
        <div><label className="label">Ad soyad</label><input className="input" value={f} onChange={(e) => setF(e.target.value)} /></div>
        <div><label className="label">Şifre</label><input className="input" type="password" value={p} onChange={(e) => setP(e.target.value)} /></div>
      </div>
    </Modal>
  );
}
