import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Box, CircleDashed, LogIn } from 'lucide-react';

export default function App() {
  const [view, setView] = useState('landing'); // 'landing', 'login', 'signup'

  return (
    <>
      <div className="bg-gradient" />
      <div className="bg-noise" />

      {/* Navigation */}
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

      {/* Main Content Area */}
      <main style={styles.main}>
        <AnimatePresence mode="wait">
          {view === 'landing' && <LandingView key="landing" setView={setView} />}
          {view === 'login' && <AuthView key="login" type="login" setView={setView} />}
          {view === 'signup' && <AuthView key="signup" type="signup" setView={setView} />}
        </AnimatePresence>
      </main>
    </>
  );
}

function LandingView({ setView }) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 40, scale: 0.95 },
    show: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } 
    }
  };

  return (
    <motion.div 
      variants={container} 
      initial="hidden" 
      animate="show" 
      exit={{ opacity: 0, y: -20, transition: { duration: 0.4 } }}
      style={styles.landingContainer}
    >
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
        <button 
          style={styles.primaryButton}
          onClick={() => setView('signup')}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          Start Building <ArrowRight size={18} />
        </button>
      </motion.div>

      {/* Abstract decorative elements */}
      <motion.div 
        variants={{
          hidden: { opacity: 0, scale: 0.8, rotate: -10 },
          show: { opacity: 1, scale: 1, rotate: 0, transition: { duration: 1.5, ease: "easeOut" } }
        }}
        style={styles.decorativeCircle}
      />
    </motion.div>
  );
}

function AuthView({ type, setView }) {
  const isLogin = type === 'login';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.96, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={styles.authContainer}
    >
      <div style={styles.authCard}>
        <h2 style={styles.authTitle}>{isLogin ? 'Welcome back.' : 'Create your account.'}</h2>
        <p style={styles.authSubtitle}>
          {isLogin ? 'Enter your credentials to access your store.' : 'Join the new standard of commerce.'}
        </p>

        <form style={styles.authForm} onSubmit={(e) => e.preventDefault()}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Email address</label>
            <input type="email" style={styles.input} placeholder="name@company.com" />
          </div>
          
          <div style={styles.inputGroup}>
            <div style={styles.passwordHeader}>
              <label style={styles.label}>Password</label>
              {isLogin && <a href="#" style={styles.forgotLink}>Forgot?</a>}
            </div>
            <input type="password" style={styles.input} placeholder="••••••••" />
          </div>

          <button 
            type="submit" 
            style={{...styles.primaryButton, width: '100%', justifyContent: 'center', marginTop: '1rem'}}
          >
            {isLogin ? 'Sign In' : 'Create Account'} <ArrowRight size={18} />
          </button>
        </form>

        <div style={styles.authFooter}>
          {isLogin ? "Don't have an account?" : "Already have an account?"}
          <button 
            style={styles.textButton} 
            onClick={() => setView(isLogin ? 'signup' : 'login')}
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

const styles = {
  nav: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    padding: '2rem 4rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 100,
  },
  logo: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '1.25rem',
    letterSpacing: '0.05em',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    cursor: 'pointer',
  },
  navLinks: {
    display: 'flex',
    gap: '2rem',
    alignItems: 'center',
  },
  navButton: {
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    border: '1px solid transparent',
    transition: 'all 0.2s',
  },
  main: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    position: 'relative',
  },
  landingContainer: {
    maxWidth: '900px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    zIndex: 10,
    position: 'relative',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border)',
    padding: '0.5rem 1rem',
    borderRadius: '100px',
    fontSize: '0.85rem',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: '2rem',
  },
  heroTitle: {
    fontSize: 'clamp(4rem, 8vw, 7rem)',
    lineHeight: 0.95,
    marginBottom: '1.5rem',
    color: 'var(--text-primary)',
  },
  heroTitleAccent: {
    color: 'var(--accent)',
  },
  heroSubtitle: {
    fontSize: 'clamp(1.1rem, 2vw, 1.25rem)',
    color: 'var(--text-secondary)',
    maxWidth: '600px',
    marginBottom: '3rem',
  },
  ctaGroup: {
    display: 'flex',
    gap: '1rem',
  },
  primaryButton: {
    background: 'var(--accent)',
    color: '#000',
    padding: '1rem 2rem',
    borderRadius: '2px',
    fontSize: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  decorativeCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '600px',
    height: '600px',
    border: '1px solid rgba(232, 255, 0, 0.1)',
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: -1,
    pointerEvents: 'none',
  },
  authContainer: {
    width: '100%',
    maxWidth: '440px',
    zIndex: 10,
  },
  authCard: {
    background: 'rgba(10, 10, 15, 0.6)',
    backdropFilter: 'blur(20px)',
    border: '1px solid var(--border)',
    padding: '3rem',
    borderRadius: '16px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
  },
  authTitle: {
    fontSize: '2rem',
    marginBottom: '0.5rem',
  },
  authSubtitle: {
    color: 'var(--text-secondary)',
    marginBottom: '2.5rem',
    fontSize: '0.95rem',
  },
  authForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    textAlign: 'left',
  },
  passwordHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  forgotLink: {
    fontSize: '0.85rem',
    color: 'var(--accent)',
    textDecoration: 'none',
  },
  input: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border)',
    padding: '0.875rem 1rem',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    fontSize: '1rem',
    transition: 'border-color 0.2s',
  },
  authFooter: {
    marginTop: '2rem',
    textAlign: 'center',
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
  },
  textButton: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    marginLeft: '0.5rem',
    fontSize: '0.9rem',
  }
};
