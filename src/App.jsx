import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, LogOut, Music, ExternalLink } from 'lucide-react'
import { supabase } from './supabaseClient'
import './App.css'

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function todayParts() {
  const d = new Date()
  return {
    dateInput: d.toISOString().slice(0, 10),
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  }
}

function formatFindDate(song) {
  if (!song?.find_year) return ''
  if (song.date_precision === 'year') return String(song.find_year)

  if (song.date_precision === 'month') {
    const d = new Date(song.find_year, (song.find_month || 1) - 1, 1)
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }

  const d = new Date(song.find_year, (song.find_month || 1) - 1, song.find_day || 1)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getPlatform(url = '') {
  const u = url.toLowerCase()
  if (u.includes('spotify.com')) return 'Spotify'
  if (u.includes('music.apple.com')) return 'Apple Music'
  if (u.includes('soundcloud.com')) return 'SoundCloud'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube'
  if (!u) return ''
  return 'Other'
}

function normalizeSong(row) {
  return {
    ...row,
    tags: (row.song_tags || [])
      .map((st) => st.tags)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  async function sendMagicLink(e) {
    e.preventDefault()
    setLoading(true)
    setStatus('')

    const redirectTo = `${window.location.origin}/admin`

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })

    setLoading(false)

    if (error) {
      setStatus(`Error: ${error.message}`)
    } else {
      setStatus('Magic link sent. Open it on this device/browser.')
    }
  }

  return (
    <main className="page narrow">
      <a className="backLink" href="/">← Back to songs</a>

      <section className="panel">
        <h1>Admin login</h1>
        <p className="muted">Enter your email and Supabase will send a magic link.</p>

        <form onSubmit={sendMagicLink} className="stack">
          <input
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <button className="primaryButton" disabled={loading}>
            {loading ? 'Sending...' : 'Send magic link'}
          </button>
        </form>

        {status && <p className="status">{status}</p>}
      </section>
    </main>
  )
}

function FeedPage() {
  const [songs, setSongs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState('')

  async function loadSongs() {
    setLoading(true)

    const { data, error } = await supabase
      .from('songs')
      .select(`
        id,
        title,
        artist,
        album,
        link_url,
        platform,
        cover_url,
        find_year,
        find_month,
        find_day,
        date_precision,
        notes,
        created_at,
        song_tags (
          tags (
            id,
            name,
            slug
          )
        )
      `)
      .order('find_year', { ascending: false })
      .order('find_month', { ascending: false, nullsFirst: false })
      .order('find_day', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
    } else {
      setSongs((data || []).map(normalizeSong))
    }

    setLoading(false)
  }

  useEffect(() => {
    loadSongs()
  }, [])

  const allTags = useMemo(() => {
    const map = new Map()
    songs.forEach((song) => {
      song.tags.forEach((tag) => map.set(tag.slug, tag))
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [songs])

  const filteredSongs = useMemo(() => {
    const q = search.toLowerCase().trim()

    return songs.filter((song) => {
      const matchesSearch =
        !q ||
        song.title?.toLowerCase().includes(q) ||
        song.artist?.toLowerCase().includes(q) ||
        song.album?.toLowerCase().includes(q) ||
        song.notes?.toLowerCase().includes(q)

      const matchesTag =
        !selectedTag || song.tags.some((tag) => tag.slug === selectedTag)

      return matchesSearch && matchesTag
    })
  }, [songs, search, selectedTag])

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">JDF-FM</p>
          <h1>Ze Daily-ish DelBosQueue Bops</h1>
          <p className="muted">~a.k.a. whatever floats across le feed~</p>
        </div>

        <a className="adminButton" href="/admin">
          <Plus size={18} />
          Add
        </a>
      </header>

      <section className="filters">
        <label className="searchBox">
          <Search size={18} />
          <input
            placeholder="Search title, artist, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="tagRow">
          <button
            className={!selectedTag ? 'chip active' : 'chip'}
            onClick={() => setSelectedTag('')}
          >
            all
          </button>

          {allTags.map((tag) => (
            <button
              key={tag.slug}
              className={selectedTag === tag.slug ? 'chip active' : 'chip'}
              onClick={() => setSelectedTag(tag.slug)}
            >
              {tag.name}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <p className="muted">Loading songs...</p>
      ) : filteredSongs.length === 0 ? (
        <section className="empty">
          <Music size={32} />
          <p>No songs yet.</p>
        </section>
      ) : (
        <section className="grid">
          {filteredSongs.map((song) => (
            <article className="songCard" key={song.id}>
              <div className="coverWrap">
                {song.cover_url ? (
                  <img src={song.cover_url} alt={`${song.title} cover`} />
                ) : (
                  <div className="coverFallback">
                    <Music size={34} />
                  </div>
                )}
              </div>

              <div className="songBody">
                <div className="songTop">
                  <div>
                    <h2>{song.title}</h2>
                    <p className="artist">{song.artist}</p>
                    {song.album && <p className="album">{song.album}</p>}
                  </div>

                  {song.link_url && (
                    <a
                      className="linkIcon"
                      href={song.link_url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open song link"
                    >
                      <ExternalLink size={18} />
                    </a>
                  )}
                </div>

                <p className="dateLine">Found: {formatFindDate(song)}</p>

                {song.notes && <p className="notes">{song.notes}</p>}

                <div className="tagRow small">
                  {song.tags.map((tag) => (
                    <button
                      key={tag.slug}
                      className="chip"
                      onClick={() => setSelectedTag(tag.slug)}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>

                {song.platform && <p className="platform">{song.platform}</p>}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}

function AdminPage({ session }) {
  const initial = todayParts()

  const [form, setForm] = useState({
    title: '',
    artist: '',
    album: '',
    link_url: '',
    cover_url: '',
    date_input: initial.dateInput,
    date_precision: 'day',
    tags: '',
    notes: '',
  })

  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function resetForm() {
    const t = todayParts()
    setForm({
      title: '',
      artist: '',
      album: '',
      link_url: '',
      cover_url: '',
      date_input: t.dateInput,
      date_precision: 'day',
      tags: '',
      notes: '',
    })
  }

  async function saveSong(e) {
    e.preventDefault()
    setSaving(true)
    setStatus('')

    try {
      const date = new Date(`${form.date_input}T12:00:00`)
      const find_year = date.getFullYear()
      const find_month = form.date_precision === 'year' ? null : date.getMonth() + 1
      const find_day = form.date_precision === 'day' ? date.getDate() : null

      const platform = getPlatform(form.link_url)
      const baseSlug = slugify(`${form.artist}-${form.title}`)
      const uniqueSlug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`

      const { data: song, error: songError } = await supabase
        .from('songs')
        .insert({
          title: form.title.trim(),
          artist: form.artist.trim(),
          album: form.album.trim() || null,
          link_url: form.link_url.trim() || null,
          platform: platform || null,
          cover_url: form.cover_url.trim() || null,
          find_year,
          find_month,
          find_day,
          date_precision: form.date_precision,
          notes: form.notes.trim() || null,
          slug: uniqueSlug,
          created_by: session.user.id,
        })
        .select()
        .single()

      if (songError) throw songError

      const tagNames = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const tagRows = tagNames.map((name) => ({
        name,
        slug: slugify(name),
      }))

      if (tagRows.length > 0) {
        const slugs = tagRows.map((t) => t.slug)

        const { data: existingTags, error: existingError } = await supabase
          .from('tags')
          .select('id, name, slug')
          .in('slug', slugs)

        if (existingError) throw existingError

        const existingSlugSet = new Set((existingTags || []).map((t) => t.slug))
        const missingTags = tagRows.filter((t) => !existingSlugSet.has(t.slug))

        let insertedTags = []

        if (missingTags.length > 0) {
          const { data, error } = await supabase
            .from('tags')
            .insert(missingTags)
            .select('id, name, slug')

          if (error) throw error
          insertedTags = data || []
        }

        const allTags = [...(existingTags || []), ...insertedTags]

        const joinRows = allTags.map((tag) => ({
          song_id: song.id,
          tag_id: tag.id,
        }))

        const { error: joinError } = await supabase
          .from('song_tags')
          .insert(joinRows)

        if (joinError) throw joinError
      }

      setStatus('Saved.')
      resetForm()
    } catch (err) {
      console.error(err)
      setStatus(`Error: ${err.message}`)
    }

    setSaving(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <main className="page narrow">
      <header className="adminHeader">
        <div>
          <a className="backLink" href="/">← Back to feed</a>
          <h1>Add song</h1>
          <p className="muted">Built for quick entry from iPhone Safari.</p>
        </div>

        <button className="ghostButton" onClick={signOut}>
          <LogOut size={17} />
          Log out
        </button>
      </header>

      <form className="panel formPanel" onSubmit={saveSong}>
        <label>
          Song title *
          <input
            value={form.title}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="Track name"
            required
          />
        </label>

        <label>
          Artist *
          <input
            value={form.artist}
            onChange={(e) => updateField('artist', e.target.value)}
            placeholder="Artist"
            required
          />
        </label>

        <label>
          Album
          <input
            value={form.album}
            onChange={(e) => updateField('album', e.target.value)}
            placeholder="Optional"
          />
        </label>

        <label>
          Song link
          <input
            value={form.link_url}
            onChange={(e) => updateField('link_url', e.target.value)}
            placeholder="Spotify / Apple / YouTube / SoundCloud link"
          />
        </label>

        <label>
          Cover image URL
          <input
            value={form.cover_url}
            onChange={(e) => updateField('cover_url', e.target.value)}
            placeholder="Optional for now"
          />
        </label>

        <div className="twoCol">
          <label>
            Find date
            <input
              type="date"
              value={form.date_input}
              onChange={(e) => updateField('date_input', e.target.value)}
              required
            />
          </label>

          <label>
            Date precision
            <select
              value={form.date_precision}
              onChange={(e) => updateField('date_precision', e.target.value)}
            >
              <option value="day">Exact day</option>
              <option value="month">Month only</option>
              <option value="year">Year only</option>
            </select>
          </label>
        </div>

        <label>
          Tags
          <input
            value={form.tags}
            onChange={(e) => updateField('tags', e.target.value)}
            placeholder="late night, house, sad, summer"
          />
        </label>

        <label>
          Notes
          <textarea
            value={form.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Why it hit / where you found it / whatever"
            rows={4}
          />
        </label>

        <button className="primaryButton" disabled={saving}>
          {saving ? 'Saving...' : 'Save song'}
        </button>

        {status && <p className="status">{status}</p>}
      </form>
    </main>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const path = window.location.pathname

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCheckingAuth(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setCheckingAuth(false)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  if (checkingAuth) {
    return (
      <main className="page">
        <p className="muted">Loading...</p>
      </main>
    )
  }

  if (path === '/login') {
    return <LoginPage />
  }

  if (path === '/admin') {
    if (!session) return <LoginPage />
    return <AdminPage session={session} />
  }

  return <FeedPage />
}

export default App