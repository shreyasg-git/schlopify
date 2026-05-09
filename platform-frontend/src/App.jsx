import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Box, CircleDashed, LogIn, Rocket, CheckCircle, Loader2, Store, Palette } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';

export default function App() {
  const getInitialView = () => {
    const path = window.location.pathname;
    if (path === '/shop-auth') return 'shop-auth';
    return 'landing';
  };

  const [view, setView] = useState(getInitialView);

  return (
    <>
      <div className="bg-gradient" />
      <div className="bg-noise" />

      <nav style={styles.nav}>
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={styles.logo}
          onClick={() => setView('landing')}
        >
          <Box size={24} color="var(--accent)" />
          SCHLOPIFY
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          style={styles.navLinks}
        >
          {view === 'landing' && (
            <button style={styles.navButton} onClick={() => setView('login')}>
              Sign In <LogIn size={16} />
            </button>
          )}
        </motion.div>
      </nav>

      <main style={styles.main}>
        <AnimatePresence mode="wait">
          {view === 'landing' && <LandingView key="landing" setView={setView} />}
          {view === 'login' && <AuthView key="login" type="login" setView={setView} />}
          {view === 'signup' && <AuthView key="signup" type="signup" setView={setView} />}
          {view === 'dashboard' && <DashboardView key="dashboard" />}
          {view === 'shop-auth' && <ShopAuthView key="shop-auth" />}
        </AnimatePresence>
      </main>
    </>
  );
}

/* ─── Landing ──────────────────────────────────────────────────────────────── */

function LandingView({ setView }) {
  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.2 } }
  };
  const item = {
    hidden: { opacity: 0, y: 40, scale: 0.95 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show"
      exit={{ opacity: 0, y: -20, transition: { duration: 0.4 } }}
      style={styles.landingContainer}>
      <motion.div variants={item} style={styles.pill}>
        <CircleDashed size={14} color="var(--accent)" />
        <span>Platform V2 is now live</span>
      </motion.div>
      <motion.h1 variants={item} style={styles.heroTitle}>
        Commerce,<br />
        <span style={styles.heroTitleAccent}>reimagined.</span>
      </motion.h1>
      <motion.p variants={item} style={styles.heroSubtitle}>
        Build your empire with a multi-tenant platform designed for absolute scale. 
        Zero friction, infinite possibilities.
      </motion.p>
      <motion.div variants={item} style={styles.ctaGroup}>
        <button style={styles.primaryButton} onClick={() => setView('signup')}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
          Start Building <ArrowRight size={18} />
        </button>
      </motion.div>
      <motion.div variants={{
        hidden: { opacity: 0, scale: 0.8, rotate: -10 },
        show: { opacity: 1, scale: 1, rotate: 0, transition: { duration: 1.5, ease: "easeOut" } }
      }} style={styles.decorativeCircle} />
    </motion.div>
  );
}

/* ─── Auth ─────────────────────────────────────────────────────────────────── */

function AuthView({ type, setView }) {
  const isLogin = type === 'login';
  const [error, setError] = useState('');

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await fetch('/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: credentialResponse.credential,
          role: 'tenant',
          tenant_id: ''
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Store token
      localStorage.setItem('platform_token', data.token);
      setView('dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.96, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={styles.authContainer}>
      <div style={styles.authCard}>
        <h2 style={styles.authTitle}>{isLogin ? 'Welcome back.' : 'Create your account.'}</h2>
        <p style={styles.authSubtitle}>
          {isLogin ? 'Sign in to access your store.' : 'Join the new standard of commerce.'}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '2rem 0' }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => {
              setError('Google login failed');
            }}
            theme="filled_black"
            shape="rectangular"
            size="large"
            text={isLogin ? "signin_with" : "signup_with"}
          />
        </div>

        {error && (
          <div style={{ ...styles.errorBanner, marginTop: '1rem' }}>{error}</div>
        )}

        <div style={styles.authFooter}>
          {isLogin ? "Don't have an account?" : "Already have an account?"}
          <button style={styles.textButton} onClick={() => setView(isLogin ? 'signup' : 'login')}>
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ShopAuthView() {
  const [error, setError] = useState('');
  const searchParams = new URLSearchParams(window.location.search);
  const tenantId = searchParams.get('tenant_id');
  const redirectUri = searchParams.get('redirect_uri');

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      if (!tenantId || !redirectUri) {
        throw new Error('Missing tenant_id or redirect_uri');
      }

      const res = await fetch('/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: credentialResponse.credential,
          role: 'customer',
          tenant_id: tenantId
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Redirect back to the shop with the token
      window.location.href = `${redirectUri}?token=${data.token}`;
    } catch (err) {
      setError(err.message);
    }
  };

  if (!tenantId || !redirectUri) {
    return (
      <div style={styles.authContainer}>
        <div style={styles.authCard}>
          <h2 style={styles.authTitle}>Invalid Request</h2>
          <p style={styles.authSubtitle}>Missing authentication parameters.</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.96, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={styles.authContainer}>
      <div style={styles.authCard}>
        <h2 style={styles.authTitle}>Login to {tenantId}</h2>
        <p style={styles.authSubtitle}>
          Authorize with Google to continue to the shop.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '2rem 0' }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => {
              setError('Google login failed');
            }}
            theme="filled_black"
            shape="rectangular"
            size="large"
            text="signin_with"
          />
        </div>

        {error && (
          <div style={{ ...styles.errorBanner, marginTop: '1rem' }}>{error}</div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Dashboard (Deploy Form) ──────────────────────────────────────────────── */

const themes = [
  {
    id: 'brutalist',
    name: 'Brutalist',
    desc: 'Bold, raw, unapologetic. Heavy borders, stark contrast, loud typography.',
    colors: ['#000000', '#FFFFFF', '#FF0000'],
  },
  {
    id: 'minimal',
    name: 'Minimal Modern',
    desc: 'Clean lines, soft tones, refined whitespace. Understated elegance.',
    colors: ['#0a0a0f', '#f8f8f8', '#6366f1'],
  },
];

function DashboardView() {
  const [shopName, setShopName] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('brutalist');
  const [status, setStatus] = useState('idle'); // idle | deploying | success | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleDeploy = async (e) => {
    e.preventDefault();
    if (!shopName.trim()) return;

    setStatus('deploying');
    setError('');

    try {
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_name: shopName, theme: selectedTheme }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Deployment failed');
      }

      setResult(data);
      setStatus('success');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.96, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={styles.dashboardContainer}>

      <AnimatePresence mode="wait">
        {status === 'deploying' && <DeployingState key="deploying" shopName={shopName} />}
        {status === 'success' && <SuccessState key="success" result={result} onReset={() => { setStatus('idle'); setResult(null); setShopName(''); }} />}
        {(status === 'idle' || status === 'error') && (
          <motion.div key="form"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}
            style={styles.formWrapper}>
            <div style={styles.dashboardHeader}>
              <Rocket size={28} color="var(--accent)" />
              <h2 style={styles.dashboardTitle}>Deploy a new shop</h2>
              <p style={styles.dashboardSubtitle}>
                Your store will be live in under 60 seconds. Pick a name, choose a vibe.
              </p>
            </div>

            <form onSubmit={handleDeploy} style={styles.deployForm}>
              {/* Shop Name */}
              <div style={styles.inputGroup}>
                <label style={styles.label}>
                  <Store size={14} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                  Shop Name
                </label>
                <input
                  type="text" style={styles.input} placeholder="cool-kicks"
                  value={shopName} onChange={e => setShopName(e.target.value)}
                  required
                />
                <span style={styles.hint}>
                  URL preview: <span style={{ color: 'var(--accent)' }}>
                    {shopName.trim() ? slugify(shopName) : '...'}.192.168.49.2.nip.io
                  </span>
                </span>
              </div>

              {/* Theme Selector */}
              <div style={styles.inputGroup}>
                <label style={styles.label}>
                  <Palette size={14} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                  Theme
                </label>
                <div style={styles.themeGrid}>
                  {themes.map(t => (
                    <motion.div
                      key={t.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedTheme(t.id)}
                      style={{
                        ...styles.themeCard,
                        borderColor: selectedTheme === t.id ? 'var(--accent)' : 'var(--border)',
                        boxShadow: selectedTheme === t.id ? '0 0 20px rgba(232, 255, 0, 0.15)' : 'none',
                      }}>
                      <div style={styles.themeSwatches}>
                        {t.colors.map((c, i) => (
                          <div key={i} style={{ ...styles.swatch, background: c }} />
                        ))}
                      </div>
                      <div style={styles.themeName}>{t.name}</div>
                      <div style={styles.themeDesc}>{t.desc}</div>
                      {selectedTheme === t.id && (
                        <motion.div layoutId="theme-check" style={styles.themeCheck}>
                          <CheckCircle size={18} color="var(--accent)" />
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>

              {error && (
                <div style={styles.errorBanner}>{error}</div>
              )}

              <button type="submit" disabled={!shopName.trim()}
                style={{
                  ...styles.primaryButton,
                  width: '100%', justifyContent: 'center', marginTop: '0.5rem',
                  opacity: shopName.trim() ? 1 : 0.5,
                }}>
                Deploy Shop <Rocket size={18} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Deploying Animation ──────────────────────────────────────────────────── */

function DeployingState({ shopName }) {
  const steps = [
    'Creating namespace...',
    'Provisioning database...',
    'Starting API layer...',
    'Deploying frontend...',
    'Configuring routing...',
    'Initialising schema...',
  ];
  const [step, setStep] = useState(0);

  useState(() => {
    const interval = setInterval(() => {
      setStep(prev => Math.min(prev + 1, steps.length - 1));
    }, 2500);
    return () => clearInterval(interval);
  });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.5 }}
      style={styles.deployingContainer}>
      <motion.div animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
        <Loader2 size={48} color="var(--accent)" />
      </motion.div>
      <h2 style={{ ...styles.dashboardTitle, marginTop: '2rem' }}>
        Deploying <span style={{ color: 'var(--accent)' }}>{shopName}</span>
      </h2>
      <div style={styles.stepList}>
        {steps.map((s, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: i <= step ? 1 : 0.3, x: 0 }}
            transition={{ delay: i * 0.1, duration: 0.3 }}
            style={styles.stepItem}>
            {i < step ? <CheckCircle size={14} color="var(--accent)" /> :
             i === step ? <Loader2 size={14} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} /> :
             <CircleDashed size={14} color="var(--text-secondary)" />}
            <span>{s}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/* ─── Success State ────────────────────────────────────────────────────────── */

function SuccessState({ result, onReset }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={styles.successContainer}>
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}>
        <CheckCircle size={64} color="var(--accent)" />
      </motion.div>
      <h2 style={{ ...styles.dashboardTitle, marginTop: '1.5rem' }}>Shop is live!</h2>
      <p style={styles.dashboardSubtitle}>{result.message}</p>
      <a href={result.url} target="_blank" rel="noopener noreferrer"
        style={styles.urlLink}>
        {result.url}
        <ArrowRight size={16} />
      </a>
      <div style={styles.metaRow}>
        <span style={styles.metaLabel}>Namespace</span>
        <code style={styles.metaValue}>{result.namespace}</code>
      </div>
      <button onClick={onReset}
        style={{ ...styles.primaryButton, marginTop: '2rem', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
        Deploy Another
      </button>
    </motion.div>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function slugify(name) {
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

/* ─── Styles ───────────────────────────────────────────────────────────────── */

const styles = {
  nav: { position: 'fixed', top: 0, left: 0, width: '100%', padding: '2rem 4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100 },
  logo: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' },
  navLinks: { display: 'flex', gap: '2rem', alignItems: 'center' },
  navButton: { background: 'transparent', color: 'var(--text-primary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid transparent', transition: 'all 0.2s' },
  main: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative' },
  landingContainer: { maxWidth: '900px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', zIndex: 10, position: 'relative' },
  pill: { display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', padding: '0.5rem 1rem', borderRadius: '100px', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '2rem' },
  heroTitle: { fontSize: 'clamp(4rem, 8vw, 7rem)', lineHeight: 0.95, marginBottom: '1.5rem', color: 'var(--text-primary)' },
  heroTitleAccent: { color: 'var(--accent)' },
  heroSubtitle: { fontSize: 'clamp(1.1rem, 2vw, 1.25rem)', color: 'var(--text-secondary)', maxWidth: '600px', marginBottom: '3rem' },
  ctaGroup: { display: 'flex', gap: '1rem' },
  primaryButton: { background: 'var(--accent)', color: '#000', padding: '1rem 2rem', borderRadius: '2px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)', fontWeight: 700, cursor: 'pointer', border: 'none' },
  decorativeCircle: { position: 'absolute', top: '50%', left: '50%', width: '600px', height: '600px', border: '1px solid rgba(232, 255, 0, 0.1)', borderRadius: '50%', transform: 'translate(-50%, -50%)', zIndex: -1, pointerEvents: 'none' },
  authContainer: { width: '100%', maxWidth: '440px', zIndex: 10 },
  authCard: { background: 'rgba(10, 10, 15, 0.6)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', padding: '3rem', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' },
  authTitle: { fontSize: '2rem', marginBottom: '0.5rem' },
  authSubtitle: { color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '0.95rem' },
  authForm: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' },
  passwordHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center' },
  forgotLink: { fontSize: '0.85rem', color: 'var(--accent)', textDecoration: 'none' },
  input: { background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border)', padding: '0.875rem 1rem', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '1rem', transition: 'border-color 0.2s', fontFamily: 'var(--font-body)' },
  authFooter: { marginTop: '2rem', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)' },
  textButton: { background: 'none', border: 'none', color: 'var(--accent)', marginLeft: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' },

  // Dashboard
  dashboardContainer: { width: '100%', maxWidth: '640px', zIndex: 10 },
  formWrapper: { background: 'rgba(10, 10, 15, 0.6)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', padding: '3rem', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' },
  dashboardHeader: { marginBottom: '2rem', textAlign: 'center' },
  dashboardTitle: { fontSize: '1.75rem', marginTop: '0.75rem', marginBottom: '0.25rem' },
  dashboardSubtitle: { color: 'var(--text-secondary)', fontSize: '0.95rem' },
  deployForm: { display: 'flex', flexDirection: 'column', gap: '1.75rem' },
  hint: { fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' },
  themeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  themeCard: { background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', cursor: 'pointer', position: 'relative', transition: 'border-color 0.2s, box-shadow 0.2s' },
  themeSwatches: { display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' },
  swatch: { width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)' },
  themeName: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' },
  themeDesc: { fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 },
  themeCheck: { position: 'absolute', top: '1rem', right: '1rem' },
  errorBanner: { background: 'rgba(255, 50, 50, 0.1)', border: '1px solid rgba(255, 50, 50, 0.3)', borderRadius: '8px', padding: '0.75rem 1rem', color: '#ff5555', fontSize: '0.9rem' },

  // Deploying
  deployingContainer: { textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  stepList: { display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '2rem', textAlign: 'left' },
  stepItem: { display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-secondary)' },

  // Success
  successContainer: { textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(10, 10, 15, 0.6)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', padding: '3rem', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' },
  urlLink: { display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(232, 255, 0, 0.08)', border: '1px solid rgba(232, 255, 0, 0.2)', padding: '1rem 1.5rem', borderRadius: '8px', color: 'var(--accent)', fontSize: '1.1rem', fontFamily: 'var(--font-display)', fontWeight: 700, marginTop: '1.5rem', textDecoration: 'none', transition: 'background 0.2s' },
  metaRow: { display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' },
  metaLabel: { fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  metaValue: { fontSize: '0.85rem', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.75rem', borderRadius: '4px' },
};
