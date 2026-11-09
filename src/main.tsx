import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/data/auth'
import { StoreProvider } from '@/data/store'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <StoreProvider>
          <TooltipProvider delayDuration={300}>
            <App />
            <Toaster position="bottom-center" richColors closeButton toastOptions={{ duration: 4000 }} offset={{ bottom: 88 }} mobileOffset={{ bottom: 96 }} />
          </TooltipProvider>
        </StoreProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
