import { useState } from 'react'

export default function Cover({ src, title }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return <div className="cover placeholder" aria-label={`No cover for ${title}`}>📖</div>
  }
  return <img className="cover" src={src} alt={`Cover of ${title}`} loading="lazy" onError={() => setFailed(true)} />
}
