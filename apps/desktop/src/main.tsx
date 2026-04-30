import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './index.css';
import App from './App';
import { installNativeShellGuards } from './nativeShell';
import { supabase } from './lib/supabase';
import { LS_PERSIST_SESSION } from './lib/userRole';

installNativeShellGuards();

function readPersistSessionFlag(): string | null {
  try {
    return localStorage.getItem(LS_PERSIST_SESSION);
  } catch {
    return null;
  }
}

async function bootstrapAuth(): Promise<void> {
  if (!supabase) return;
  if (readPersistSessionFlag() === '0') {
    await supabase.auth.signOut();
  }
}

void bootstrapAuth().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
});
