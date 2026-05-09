import React, { useEffect } from 'react';

export function Login() {
  useEffect(() => {
    const hostname = window.location.hostname;
    const tenantId = hostname === 'localhost' ? 'demo-shop' : hostname.split('.')[0];
    
    // Compute platform origin
    const platformOrigin = hostname === 'localhost' 
      ? 'http://localhost:5173' 
      : `${window.location.protocol}//schlopify.${hostname.split('.').slice(1).join('.')}${window.location.port ? ':' + window.location.port : ''}`;

    const redirectUri = encodeURIComponent(`${window.location.origin}/login-callback`);
    
    window.location.href = `${platformOrigin}/shop-auth?tenant_id=${tenantId}&redirect_uri=${redirectUri}`;
  }, []);

  return (
    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <p>Redirecting to secure login...</p>
    </div>
  );
}
