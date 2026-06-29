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
function formatExactDate(dateString) {
  if (!dateString) return ''

  const d = new Date(`${dateString}T12:00:00`)

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
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingMagic, setSendingMagic] = useState(false)

  async function handlePasswordAuth(e) {
    e.preventDefault()
    setLoading(true)
    setStatus('')

    const payload = { email, password }

    const { error } =
      mode === 'signup'
        ? await supabase.auth.signUp(payload)
        : await supabase.auth.signInWithPassword(payload)

    setLoading(false)

    if (error) {
      setStatus(`${mode === 'signup' ? 'Signup' : 'Login'} error: ${error.message}`)
    } else if (mode === 'signup') {
      setStatus('Account created. If Supabase asks for email confirmation, check your inbox.')
    } else {
      window.location.href = '/admin'
    }
  }

  async function sendMagicLink() {
    if (!email.trim()) {
      setStatus('Enter your email first.')
      return
    }

    setSendingMagic(true)
    setStatus('')

    const redirectTo = `${window.location.origin}/admin`

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })

    setSendingMagic(false)

    if (error) {
      setStatus(`Magic link error: ${error.message}`)
    } else {
      setStatus('Magic link sent.')
    }
  }

  return (
    <main className="page narrow">
      <a className="backLink" href="/">← Back to JDF-FM</a>

      <section className="panel">
        <h1>{mode === 'signup' ? 'Create account' : 'Login'}</h1>
        <p className="muted">
          Login is optional — only needed to comment or vote.
        </p>

        <div className="modeToggle">
          <button
            type="button"
            className={mode === 'login' ? 'chip active' : 'chip'}
            onClick={() => setMode('login')}
          >
            login
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'chip active' : 'chip'}
            onClick={() => setMode('signup')}
          >
            sign up
          </button>
        </div>

        <form onSubmit={handlePasswordAuth} className="stack">
          <input
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <input
            type="password"
            placeholder={mode === 'signup' ? 'Create password' : 'Password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={8}
            required
          />

          <button className="primaryButton" disabled={loading}>
            {loading
              ? mode === 'signup'
                ? 'Creating...'
                : 'Logging in...'
              : mode === 'signup'
                ? 'Create account'
                : 'Log in'}
          </button>

          <button
            type="button"
            className="secondaryButton"
            onClick={sendMagicLink}
            disabled={sendingMagic}
          >
            {sendingMagic ? 'Sending magic link...' : 'Send magic link instead'}
          </button>
        </form>

        {status && <p className="status">{status}</p>}
      </section>
    </main>
  )
}
function FooterBar() {
  return (
    <footer className="footerBar">
      <p>JDF-FM · Daily-ish finds from the DelBosQueue</p>
      <p>Inspired by Jezzahs unparalleled passion for the tunes</p>
    </footer>
  )
}
function FeedPage({ session }) {
 const [songs, setSongs] = useState([])
const [loading, setLoading] = useState(true)
const [search, setSearch] = useState('')
const [selectedTag, setSelectedTag] = useState('')
const [viewMode, setViewMode] = useState(
  localStorage.getItem('jdf_fm_view_mode') || 'cards'
)
const [sortBy, setSortBy] = useState(
  localStorage.getItem('jdf_fm_sort_by') || 'post_date'
)

const [sortDir, setSortDir] = useState(
  localStorage.getItem('jdf_fm_sort_dir') || 'desc'
)
const [expandedSongId, setExpandedSongId] = useState(null)
const [commentDrafts, setCommentDrafts] = useState({})
const [authorName, setAuthorName] = useState(
  localStorage.getItem('jdf_fm_author_name') || ''
)
const [actionStatus, setActionStatus] = useState('')
async function loadSongs() {
  setLoading(true)

  const { data: songData, error: songError } = await supabase
    .from('songs')
    .select(`
      id,
      title,
      artist,
      album,
      link_url,
      platform,
      cover_url,
      post_date,
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
.order('post_date', { ascending: false })
.order('created_at', { ascending: false })
.order('find_year', { ascending: false })
.order('find_month', { ascending: false, nullsFirst: false })
.order('find_day', { ascending: false, nullsFirst: false })

  if (songError) {
    console.error(songError)
    setLoading(false)
    return
  }

  const songIds = (songData || []).map((s) => s.id)

  let commentRows = []
  let voteRows = []

  if (songIds.length > 0) {
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select('id, song_id, user_id, author_name, body, created_at')
      .in('song_id', songIds)
      .order('created_at', { ascending: true })

    if (commentsError) {
      console.error(commentsError)
    } else {
      commentRows = comments || []
    }

    const { data: votes, error: votesError } = await supabase
      .from('song_votes')
      .select('song_id, user_id, value')
      .in('song_id', songIds)

    if (votesError) {
      console.error(votesError)
    } else {
      voteRows = votes || []
    }
  }

  const commentsBySong = new Map()
  commentRows.forEach((comment) => {
    const existing = commentsBySong.get(comment.song_id) || []
    existing.push(comment)
    commentsBySong.set(comment.song_id, existing)
  })

  const votesBySong = new Map()
  voteRows.forEach((vote) => {
    const stats = votesBySong.get(vote.song_id) || {
      upvotes: 0,
      downvotes: 0,
      myVote: 0,
    }

    if (vote.value === 1) stats.upvotes += 1
    if (vote.value === -1) stats.downvotes += 1
    if (session?.user?.id && vote.user_id === session.user.id) {
      stats.myVote = vote.value
    }

    votesBySong.set(vote.song_id, stats)
  })

  const enrichedSongs = (songData || []).map((song) => {
    const comments = commentsBySong.get(song.id) || []
    const votes = votesBySong.get(song.id) || {
      upvotes: 0,
      downvotes: 0,
      myVote: 0,
    }

    return {
      ...normalizeSong(song),
      comments,
      comment_count: comments.length,
      upvotes: votes.upvotes,
      downvotes: votes.downvotes,
      score: votes.upvotes - votes.downvotes,
      myVote: votes.myVote,
    }
  })

  setSongs(enrichedSongs)
  setLoading(false)
}
function requireLogin() {
  window.location.href = '/login'
}
function changeViewMode(nextMode) {
  setViewMode(nextMode)
  localStorage.setItem('jdf_fm_view_mode', nextMode)
}
function changeSortBy(nextSortBy) {
  setSortBy(nextSortBy)
  localStorage.setItem('jdf_fm_sort_by', nextSortBy)
}

function changeSortDir(nextSortDir) {
  setSortDir(nextSortDir)
  localStorage.setItem('jdf_fm_sort_dir', nextSortDir)
}

function findDateSortValue(song) {
  const year = song.find_year || 0
  const month = song.find_month || 1
  const day = song.find_day || 1

  return year * 10000 + month * 100 + day
}

function songSortValue(song, key) {
  if (key === 'likes') return song.upvotes || 0
  if (key === 'comments') return song.comment_count || 0
  if (key === 'find_date') return findDateSortValue(song)

  // default: post_date
  return song.post_date ? new Date(`${song.post_date}T12:00:00`).getTime() : 0
}
async function handleVote(song, value) {
  if (!session) {
    requireLogin()
    return
  }

  setActionStatus('')

  try {
    if (song.myVote === value) {
      const { error } = await supabase
        .from('song_votes')
        .delete()
        .eq('song_id', song.id)
        .eq('user_id', session.user.id)

      if (error) throw error
    } else {
      const { error } = await supabase
        .from('song_votes')
        .upsert(
          {
            song_id: song.id,
            user_id: session.user.id,
            value,
          },
          { onConflict: 'song_id,user_id' }
        )

      if (error) throw error
    }

    await loadSongs()
  } catch (err) {
    console.error(err)
    setActionStatus(`Vote failed: ${err.message}`)
  }
}

async function addComment(songId) {
  if (!session) {
    requireLogin()
    return
  }

  const body = (commentDrafts[songId] || '').trim()
  const cleanName =
    authorName.trim() ||
    session.user.email?.split('@')[0] ||
    'friend'

  if (!body) {
    setActionStatus('Write a comment first.')
    return
  }

  if (body.length > 500) {
    setActionStatus('Comment is too long. Keep it under 500 characters.')
    return
  }

  localStorage.setItem('jdf_fm_author_name', cleanName)

  try {
    const { error } = await supabase.from('comments').insert({
      song_id: songId,
      user_id: session.user.id,
      author_name: cleanName,
      body,
    })

    if (error) throw error

    setCommentDrafts((prev) => ({ ...prev, [songId]: '' }))
    setAuthorName(cleanName)
    setActionStatus('')
    await loadSongs()
  } catch (err) {
    console.error(err)
    setActionStatus(`Comment failed: ${err.message}`)
  }
}
useEffect(() => {
  loadSongs()
}, [session?.user?.id])

  const allTags = useMemo(() => {
    const map = new Map()
    songs.forEach((song) => {
      song.tags.forEach((tag) => map.set(tag.slug, tag))
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [songs])

  const filteredSongs = useMemo(() => {
  const q = search.toLowerCase().trim()

  const filtered = songs.filter((song) => {
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

  return [...filtered].sort((a, b) => {
    const av = songSortValue(a, sortBy)
    const bv = songSortValue(b, sortBy)

    if (av !== bv) {
      return sortDir === 'asc' ? av - bv : bv - av
    }

    // Tie-breaker: newest created first.
    const ac = new Date(a.created_at || 0).getTime()
    const bc = new Date(b.created_at || 0).getTime()
    return bc - ac
  })
}, [songs, search, selectedTag, sortBy, sortDir])

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">ur listening to:</p>  
          <h1>JDF-FM</h1>
          <p className="muted">Ze Daily-ish DelBosQueue Bops: whatever floats across LeFeed </p>
          <p className="muted">-- Brought to you by the Gliceoline Corporation, GMbH, a.r.r. -- </p>
        </div>

<div className="heroButtons">
  {session ? (
    <button className="ghostButton" onClick={() => supabase.auth.signOut()}>
      <LogOut size={17} />
      Log out
    </button>
  ) : (
    <a className="ghostButton" href="/login">
      Login
    </a>
  )}

  <a className="adminButton" href="/admin">
    <Plus size={18} />
    Add
  </a>
</div>
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
<div className="viewToggle">
  <button
    type="button"
    className={viewMode === 'cards' ? 'viewButton active' : 'viewButton'}
    onClick={() => changeViewMode('cards')}
  >
    Cards
  </button>

  <button
    type="button"
    className={viewMode === 'list' ? 'viewButton active' : 'viewButton'}
    onClick={() => changeViewMode('list')}
  >
    List
  </button>
</div>

<div className="sortControls">
  <label>
    Sort by
    <select
      value={sortBy}
      onChange={(e) => changeSortBy(e.target.value)}
    >
      <option value="post_date">Post date</option>
      <option value="find_date">Find date</option>
      <option value="likes">Likes</option>
      <option value="comments">Comments</option>
    </select>
  </label>

  <label>
    Order
    <select
      value={sortDir}
      onChange={(e) => changeSortDir(e.target.value)}
    >
      <option value="desc">High/new → low/old</option>
      <option value="asc">Low/old → high/new</option>
    </select>
  </label>
</div>


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
        <section className={viewMode === 'list' ? 'listView' : 'grid'}>
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

<p className="dateLine">Posted: {formatExactDate(song.post_date)}</p>
{formatFindDate(song) !== formatExactDate(song.post_date) && (
  <p className="dateLine">Found: {formatFindDate(song)}</p>
)}
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
              <div className="cardActions">
  <button
    type="button"
    className={song.myVote === 1 ? 'voteButton active' : 'voteButton'}
    onClick={() => handleVote(song, 1)}
  >
    ↑ {song.upvotes}
  </button>

  <button
    type="button"
    className={song.myVote === -1 ? 'voteButton active' : 'voteButton'}
    onClick={() => handleVote(song, -1)}
  >
    ↓ {song.downvotes}
  </button>

  <button
    type="button"
    className="commentCountButton"
    onClick={() =>
      setExpandedSongId(expandedSongId === song.id ? null : song.id)
    }
  >
    {song.comment_count} comment{song.comment_count === 1 ? '' : 's'}
  </button>
</div>

{expandedSongId === song.id && (
  <section className="commentsPanel">
    {song.comments.length === 0 ? (
      <p className="muted tiny">No comments yet.</p>
    ) : (
      song.comments.map((comment) => (
        <div className="commentItem" key={comment.id}>
          <div className="commentMeta">
            {comment.author_name}
          </div>
          <p>{comment.body}</p>
        </div>
      ))
    )}

    {session ? (
      <div className="commentForm">
        <input
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="Display name"
          maxLength={40}
        />

        <textarea
          value={commentDrafts[song.id] || ''}
          onChange={(e) =>
            setCommentDrafts((prev) => ({
              ...prev,
              [song.id]: e.target.value,
            }))
          }
          placeholder="Add a comment..."
          rows={3}
          maxLength={500}
        />

        <button
          type="button"
          className="secondaryButton"
          onClick={() => addComment(song.id)}
        >
          Post comment
        </button>
      </div>
    ) : (
      <a className="loginPrompt" href="/login">
        Log in to comment or vote
      </a>
    )}
  </section>
)}
              
              </div>
            </article>
          ))}
        </section>
      )}
      <FooterBar />
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
  post_date: initial.dateInput,
  date_input: initial.dateInput,
  date_precision: 'day',
  tags: '',
  notes: '',
})

  const [saving, setSaving] = useState(false)
  const [fetchingMeta, setFetchingMeta] = useState(false)
  const [status, setStatus] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [settingPassword, setSettingPassword] = useState(false)

async function setAccountPassword(e) {
  e.preventDefault()

  if (newPassword.length < 8) {
    setStatus('Use at least 8 characters for the password.')
    return
  }

  setSettingPassword(true)
  setStatus('Setting password...')

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  setSettingPassword(false)

  if (error) {
    setStatus(`Password error: ${error.message}`)
  } else {
    setNewPassword('')
    setStatus('Password set. Future logins can use email + password.')
  }
}

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function fetchMetadata() {
  if (!form.link_url.trim()) {
    setStatus('Paste a song link first.')
    return
  }

  setFetchingMeta(true)
  setStatus('Fetching metadata...')

  try {
    const res = await fetch(`/api/fetch-metadata?url=${encodeURIComponent(form.link_url.trim())}`)
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Could not fetch metadata')
    }

    setForm((prev) => ({
      ...prev,
      title: data.title || prev.title,
      artist: data.artist || prev.artist,
      album: data.album || prev.album,
      cover_url: data.cover_url || prev.cover_url,
    }))

    setStatus('Metadata fetched. Check title/artist before saving.')
  } catch (err) {
    console.error(err)
    setStatus(`Metadata fetch failed: ${err.message}`)
  }

  setFetchingMeta(false)
}

  function resetForm() {
    const t = todayParts()
setForm({
  title: '',
  artist: '',
  album: '',
  link_url: '',
  cover_url: '',
  post_date: t.dateInput,
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
  post_date: form.post_date,
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
<section className="panel passwordPanel">
  <form onSubmit={setAccountPassword} className="stack">
    <label>
      Set/update admin password
      <input
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="New password, 8+ chars"
        autoComplete="new-password"
      />
    </label>

    <button
      type="submit"
      className="secondaryButton"
      disabled={settingPassword || !newPassword}
    >
      {settingPassword ? 'Setting password...' : 'Set password'}
    </button>
  </form>
</section>
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
<button
  type="button"
  className="secondaryButton"
  onClick={fetchMetadata}
  disabled={fetchingMeta || !form.link_url.trim()}
>
  {fetchingMeta ? 'Fetching info...' : 'Fetch info from link'}
</button>
        <label>
          Cover image URL
          <input
            value={form.cover_url}
            onChange={(e) => updateField('cover_url', e.target.value)}
            placeholder="Optional for now"
          />
        </label>
<label>
  Post date
  <input
    type="date"
    value={form.post_date}
    onChange={(e) => updateField('post_date', e.target.value)}
    required
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

  return <FeedPage session={session} />
}

export default App