import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import { Empty } from './components/Status'
import BookDetails from './pages/BookDetails'
import Genre from './pages/Genre'
import Home from './pages/Home'
import Search from './pages/Search'

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/genre/:genre" element={<Genre />} />
          <Route path="/books/:id" element={<BookDetails />} />
          <Route path="*" element={<Empty text="Page not found." />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
