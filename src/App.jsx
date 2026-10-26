import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import RequireAuth from './components/RequireAuth'
import { Empty } from './components/Status'
import { AuthProvider } from './context/AuthContext'
import BookDetails from './pages/BookDetails'
import Genre from './pages/Genre'
import Home from './pages/Home'
import Library from './pages/Library'
import Login from './pages/Login'
import Search from './pages/Search'
import Signup from './pages/Signup'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/genre/:genre" element={<Genre />} />
            <Route path="/books/:id" element={<BookDetails />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/library" element={<RequireAuth><Library /></RequireAuth>} />
            <Route path="*" element={<Empty text="Page not found." />} />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  )
}
