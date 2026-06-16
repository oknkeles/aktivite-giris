import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { ArrowRight, Lock, CalendarCheck, BarChart3, MessageCircle } from 'lucide-react';
import { useAuth } from '../store/auth';

const FEATURES = [
  { icon: CalendarCheck, title: 'Hızlı aktivite girişi', desc: 'Takvim üzerinden tek tıkla, dakikalar içinde.' },
  { icon: BarChart3, title: 'Anlık raporlar', desc: 'Müşteri bazında saat ve tutar, tek ekranda.' },
  { icon: MessageCircle, title: 'WhatsApp ile kayıt', desc: 'Ofiste olmadan, yazarak aktivite ekle.' },
];

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
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* SOL — Marka paneli (mobilde gizli) */}
      <div
        className="hidden lg:flex flex-col justify-between p-12 xl:p-16 relative overflow-hidden"
        style={{
          background: '#0B1224',
          backgroundImage:
            'radial-gradient(circle at 12% 18%, rgba(37,99,235,.30) 0%, transparent 42%),' +
            'radial-gradient(circle at 88% 88%, rgba(8,145,178,.22) 0%, transparent 45%)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="bg-white rounded-xl px-3.5 py-2.5 flex items-center justify-center shadow-lg">
            <img src="/logo.png" alt="TDev Consulting" className="h-7 w-auto object-contain" />
          </div>
          <div className="pl-3 border-l border-white/15">
            <div className="text-[13px] font-bold text-white/90 leading-tight">Aktivite</div>
            <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Giriş Sistemi</div>
          </div>
        </div>

        {/* Slogan + özellikler */}
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl xl:text-[42px] font-extrabold text-white tracking-tight leading-[1.1] mb-4">
            Danışmanlık ekibiniz için<br />
            <span className="grad-text" style={{ backgroundSize: '200% 200%' }}>tek merkez.</span>
          </h1>
          <p className="text-white/55 text-[15px] leading-relaxed mb-10">
            Çalışma kayıtları, müşteri raporları ve mutabakat belgeleri — hepsi düzenli ve güvenli.
          </p>

          <div className="space-y-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white/[.07] border border-white/10 flex items-center justify-center flex-shrink-0">
                  <f.icon size={18} className="text-brand-sky" />
                </div>
                <div>
                  <div className="text-white/90 font-semibold text-[14px] leading-tight">{f.title}</div>
                  <div className="text-white/45 text-[12.5px] mt-0.5">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-[11px] text-white/30">
          © {new Date().getFullYear()} TDev Consulting · activity.tdevco.com
        </div>
      </div>

      {/* SAĞ — Giriş formu */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-paper">
        <div className="w-full max-w-sm">
          {/* Mobilde logo (sol panel gizliyken) */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="bg-white rounded-xl px-3.5 py-2.5 flex items-center justify-center shadow-sm border border-paper-3">
              <img src="/logo.png" alt="TDev Consulting" className="h-7 w-auto object-contain" />
            </div>
            <div className="text-[13px] font-bold text-ink leading-tight">Aktivite Giriş Sistemi</div>
          </div>

          <h2 className="text-3xl font-extrabold text-ink tracking-tight mb-1.5">Hoş geldiniz</h2>
          <p className="text-ink-3 text-sm mb-8">Devam etmek için giriş yapın.</p>

          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="bg-brand-rose/10 border border-brand-rose/20 text-brand-rose text-xs px-3.5 py-2.5 rounded-xl">
                {error}
              </div>
            )}
            <div>
              <label className="label">Kullanıcı adı</label>
              <input
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="kullanici_adi"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="label">Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full !py-3.5 mt-2"
            >
              {loading ? 'Giriş yapılıyor...' : (<>Giriş Yap <ArrowRight size={16} /></>)}
            </button>
          </form>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-ink-4 mt-6">
            <Lock size={11} />
            Hesabınız yoksa yöneticinizle iletişime geçin.
          </div>
        </div>
      </div>
    </div>
  );
}
