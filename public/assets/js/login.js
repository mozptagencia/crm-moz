const form     = document.getElementById('login-form');
const btnLogin = document.getElementById('btn-login');
const errBox   = document.getElementById('login-error');
const errMsg   = document.getElementById('login-error-msg');

// Toggle password
document.getElementById('pwd-toggle').addEventListener('click', () => {
  const input = document.getElementById('password');
  const show  = input.type === 'password';
  input.type          = show ? 'text' : 'password';
  document.getElementById('pwd-toggle').textContent = show ? '🙈' : '👁';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errBox.classList.remove('show');

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const remember = document.getElementById('remember').checked;

  if (!email || !password) {
    errMsg.textContent = 'Preenche todos os campos.';
    errBox.classList.add('show');
    return;
  }

  btnLogin.disabled = true;
  btnLogin.classList.add('loading');

  try {
    const res  = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      errMsg.textContent = data.error || 'Credenciais inválidas.';
      errBox.classList.add('show');
      return;
    }

    const storage = remember ? localStorage : sessionStorage;
    storage.setItem('moz_token', data.token);
    storage.setItem('moz_user', JSON.stringify({
      ...data.user,
      nome: data.user.name,
      token: data.token
    }));

    window.location.href = 'crm.html';

  } catch (err) {
    errMsg.textContent = 'Erro de ligação ao servidor.';
    errBox.classList.add('show');
  } finally {
    btnLogin.disabled = false;
    btnLogin.classList.remove('loading');
  }
});

// Se já tem sessão, redirecionar
(function () {
  const u = localStorage.getItem('moz_token') || sessionStorage.getItem('moz_token');
  if (u) window.location.href = 'crm.html';
})();