function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 's-maxage=86400, stale-while-revalidate=604800',
    },
  })
}

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function platformForUrl(url) {
  const host = new URL(url).hostname.toLowerCase()

  if (host.includes('spotify.com') || host.includes('spotify.link')) return 'Spotify'
  if (host.includes('soundcloud.com')) return 'SoundCloud'
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube'
  if (host.includes('music.apple.com')) return 'Apple Music'

  return 'Other'
}

function guessTitleArtist(title, authorName = '') {
  const cleanedTitle = clean(title)
  const cleanedAuthor = clean(authorName)

  if (!cleanedTitle) {
    return { title: '', artist: cleanedAuthor }
  }

  // Common format: "Artist - Song"
  const dashMatch = cleanedTitle.match(/^(.+?)\s[-–—]\s(.+)$/)
  if (dashMatch && !cleanedAuthor) {
    return {
      artist: clean(dashMatch[1]),
      title: clean(dashMatch[2]),
    }
  }

  // Common format: "Song by Artist"
  const byMatch = cleanedTitle.match(/^(.+?)\s+by\s+(.+)$/i)
  if (byMatch && !cleanedAuthor) {
    return {
      title: clean(byMatch[1]),
      artist: clean(byMatch[2]),
    }
  }

  return {
    title: cleanedTitle,
    artist: cleanedAuthor,
  }
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'JDF-FM metadata fetcher',
      accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
    },
  })

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status}`)
  }

  return res.json()
}

function getAttr(tag, attr) {
  const re = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, 'i')
  return tag.match(re)?.[1] || ''
}

function readMeta(html, names) {
  const tags = html.match(/<meta[^>]+>/gi) || []

  for (const tag of tags) {
    const property = getAttr(tag, 'property') || getAttr(tag, 'name')
    if (names.includes(property)) {
      const content = getAttr(tag, 'content')
      if (content) return clean(content)
    }
  }

  return ''
}

async function fetchOpenGraph(targetUrl) {
  const res = await fetch(targetUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 JDF-FM metadata fetcher',
      accept: 'text/html,*/*;q=0.8',
    },
  })

  if (!res.ok) {
    throw new Error(`Page fetch failed: ${res.status}`)
  }

  const html = await res.text()

  const ogTitle =
    readMeta(html, ['og:title', 'twitter:title']) ||
    clean(html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1] || '')

  const ogImage = readMeta(html, ['og:image', 'twitter:image'])

  const siteName = readMeta(html, ['og:site_name'])

  const guessed = guessTitleArtist(ogTitle)

  return {
    title: guessed.title,
    artist: guessed.artist,
    album: '',
    cover_url: ogImage,
    platform: siteName || platformForUrl(targetUrl),
  }
}

function youtubeVideoId(targetUrl) {
  const u = new URL(targetUrl)

  if (u.hostname.includes('youtu.be')) {
    return u.pathname.split('/').filter(Boolean)[0] || ''
  }

  if (u.searchParams.get('v')) {
    return u.searchParams.get('v')
  }

  const shortsMatch = u.pathname.match(/\/shorts\/([^/?]+)/)
  if (shortsMatch) return shortsMatch[1]

  return ''
}

async function fetchSpotify(targetUrl) {
  const data = await fetchJson(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(targetUrl)}`
  )

  const guessed = guessTitleArtist(data.title || '')

  return {
    title: guessed.title,
    artist: guessed.artist,
    album: '',
    cover_url: data.thumbnail_url || '',
    platform: 'Spotify',
  }
}

async function fetchSoundCloud(targetUrl) {
  const data = await fetchJson(
    `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(targetUrl)}`
  )

  const guessed = guessTitleArtist(data.title || '', data.author_name || '')

  return {
    title: guessed.title,
    artist: guessed.artist,
    album: '',
    cover_url: data.thumbnail_url || '',
    platform: 'SoundCloud',
  }
}

async function fetchYouTube(targetUrl) {
  try {
    const data = await fetchJson(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(targetUrl)}`
    )

    const guessed = guessTitleArtist(data.title || '', data.author_name || '')

    return {
      title: guessed.title,
      artist: guessed.artist,
      album: '',
      cover_url: data.thumbnail_url || '',
      platform: 'YouTube',
    }
  } catch {
    const id = youtubeVideoId(targetUrl)

    return {
      title: '',
      artist: '',
      album: '',
      cover_url: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '',
      platform: 'YouTube',
    }
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const targetUrl = searchParams.get('url')

    if (!targetUrl) {
      return json({ error: 'Missing url parameter' }, 400)
    }

    const parsed = new URL(targetUrl)

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return json({ error: 'Only http/https URLs are allowed' }, 400)
    }

    const platform = platformForUrl(targetUrl)

    let metadata

    if (platform === 'Spotify') {
      metadata = await fetchSpotify(targetUrl)
    } else if (platform === 'SoundCloud') {
      metadata = await fetchSoundCloud(targetUrl)
    } else if (platform === 'YouTube') {
      metadata = await fetchYouTube(targetUrl)
    } else {
      metadata = await fetchOpenGraph(targetUrl)
      metadata.platform = platform === 'Other' ? metadata.platform : platform
    }

    return json({
      title: metadata.title || '',
      artist: metadata.artist || '',
      album: metadata.album || '',
      cover_url: metadata.cover_url || '',
      platform: metadata.platform || platform,
    })
  } catch (err) {
    return json(
      {
        error: err.message || 'Could not fetch metadata',
      },
      500
    )
  }
}