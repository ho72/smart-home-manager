import ReactDOM from 'react-dom/client'
import AppMobile from '../mobile/app-mobile'

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppMobile />
)

// Service Worker 등록 — Web Push 알림용. localhost / HTTPS 에서만 동작.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('SW register failed:', e)
    })
  })
}
