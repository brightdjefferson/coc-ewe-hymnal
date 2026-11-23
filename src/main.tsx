import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import App from './App.tsx'
import AdminLayout from './admin/AdminLayout.tsx'
import HymnListPage from './admin/HymnListPage.tsx'
import HymnEditorPage from './admin/HymnEditorPage.tsx'

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <HymnListPage /> },
      { path: 'hymns/new', element: <HymnEditorPage /> },
      { path: 'hymns/:id', element: <HymnEditorPage /> },
    ],
  },
  { path: '*', element: <App /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
