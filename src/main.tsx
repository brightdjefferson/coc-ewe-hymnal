import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import { startPwa } from './pwa'
import CheckPage from './App.tsx'
import AdminLayout from './admin/AdminLayout.tsx'
import HymnListPage from './admin/HymnListPage.tsx'
import HymnEditorPage from './admin/HymnEditorPage.tsx'
import TaxonomyPage from './admin/TaxonomyPage.tsx'
import UploadPage from './admin/UploadPage.tsx'
import ReaderLayout from './reader/ReaderLayout.tsx'
import HomePage from './reader/HomePage.tsx'
import CollectionPage from './reader/CollectionPage.tsx'
import HymnPage from './reader/HymnPage.tsx'
import { CategoriesPage, CategoryPage, FavoritesPage, SearchPage, SettingsPage } from './reader/OtherPages.tsx'
import { PlayPage, ServicePage, ServicesListPage, SharedServicePage } from './reader/ServicesPages.tsx'
import { NotePage, NotesListPage } from './reader/NotesPages.tsx'
import MorePage from './reader/MorePage.tsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <ReaderLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'c/:slug', element: <CollectionPage /> },
      { path: 'c/:slug/:number', element: <HymnPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'categories', element: <CategoriesPage /> },
      { path: 'categories/:slug', element: <CategoryPage /> },
      { path: 'favorites', element: <FavoritesPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'services', element: <ServicesListPage /> },
      { path: 'services/:id', element: <ServicePage /> },
      { path: 'services/:id/play/:index', element: <PlayPage /> },
      { path: 's', element: <SharedServicePage /> },
      { path: 'notes', element: <NotesListPage /> },
      { path: 'notes/:id', element: <NotePage /> },
      { path: 'more', element: <MorePage /> },
      { path: '*', element: <HomePage /> },
    ],
  },
  { path: '/check', element: <CheckPage /> },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <HymnListPage /> },
      { path: 'hymns/new', element: <HymnEditorPage /> },
      { path: 'hymns/:id', element: <HymnEditorPage /> },
      { path: 'lists', element: <TaxonomyPage /> },
      { path: 'upload', element: <UploadPage /> },
    ],
  },
])

startPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
