import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import './index.css'
import Layout from './Layout.jsx'
import Home from './pages/Home.jsx'
import BackOffice from './pages/BackOffice.jsx'
import { RecordsProvider } from './context/RecordsContext.jsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'back', element: <BackOffice /> },
    ],
  },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RecordsProvider>
      <RouterProvider router={router} />
    </RecordsProvider>
  </StrictMode>,
)
