
/* ── LOGIN.JS ────────────────────────────────────────────────
   Lógica de login local (temporária, sem backend).
   Quando a Hostinger estiver configurada, substituir
   o bloco "AUTENTICAÇÃO" por um fetch() à API.
──────────────────────────────────────────────────────────── */

// ── Toggle mostrar/ocultar password ──────────────────────────
const pwdInput  = document.getElementById('password');
const pwdToggle = document.getElementById('pwd-toggle');
pwdToggle.addEventListener('click', () => {
  const show = pwdInput.type === 'password';
  pwdInput.type = show ? 'text' : 'password';
  pwdToggle.textContent = show ? '🙈' : '👁';
});

// ── Submissão do formulário ───────────────────────────────────
const form    = document.getElementById('login-form');
const btnLogin = document.getElementById('btn-login');
const errBox   = document.getElementById('login-error');
const errMsg   = document.getElementById('login-error-msg');

function showError(msg) {
  errMsg.textContent = msg;
  errBox.classList.add('show');
}
function hideError() {
  errBox.classList.remove('show');
}
function setLoading(state) {
  btnLogin.disabled = state;
  btnLogin.classList.toggle('loading', state);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const remember = document.getElementById('remember').checked;

  if (!email || !password) {
    showError('Preenche todos os campos.');
    return;
  }

  setLoading(true);

  // ══════════════════════════════════════════════════════════
  // AUTENTICAÇÃO — substituir por fetch() quando backend estiver pronto
  //
  // Exemplo de chamada futura:
  //   const res = await fetch('/api/auth/login', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ email, password })
  //   });
  //   const data = await res.json();
  //   if (!res.ok) throw new Error(data.message);
  //   localStorage.setItem('moz_token', data.token);
  //
  // Por agora: utilizadores mock (remover em produção)
  const MOCK_USERS = [
    { email: 'admin@moz.pt',   password: 'moz2026',  nome: 'Administrador', role: 'admin'  },
    { email: 'hello@moz.pt',   password: 'moz2026',  nome: 'Proprietária',  role: 'admin'  },
    { email: 'equipa@moz.pt',  password: 'equipa123', nome: 'Equipa Moz',   role: 'editor' },
  ];

  await new Promise(r => setTimeout(r, 700)); // simular latência de rede

  const user = MOCK_USERS.find(
    u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );

  if (!user) {
    setLoading(false);
    showError('Email ou palavra-passe incorrectos.');
    document.getElementById('password').value = '';
    return;
  }

  // Guardar sessão (mudar para cookie seguro com backend real)
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem('moz_user', JSON.stringify({
    email: user.email,
    nome:  user.nome,
    role:  user.role,
    loginAt: new Date().toISOString()
  }));
  // ══════════════════════════════════════════════════════════

  // Redirecionar para o CRM
  window.location.href = 'crm.html';
});

// ── Se já tem sessão activa, redirecionar ─────────────────────
(function checkSession() {
  const u = localStorage.getItem('moz_user') || sessionStorage.getItem('moz_user');
  if (u) window.location.href = 'crm.html';
})();
