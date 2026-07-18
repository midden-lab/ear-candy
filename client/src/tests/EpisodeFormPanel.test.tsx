import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import EpisodeFormPanel from '../pages/admin/EpisodeFormPanel'
import type { Episode } from '../types'

const mockUploadAudio = vi.fn()
const mockUploadEpisodeArt = vi.fn()
const mockCreateEpisode = vi.fn().mockResolvedValue({ id: 99 })
const mockUpdateEpisode = vi.fn().mockResolvedValue({ id: 10 })

vi.mock('../api', () => ({
  createEpisode: (...args: unknown[]) => mockCreateEpisode(...args),
  updateEpisode: (...args: unknown[]) => mockUpdateEpisode(...args),
  uploadAudio: (...args: unknown[]) => mockUploadAudio(...args),
  uploadEpisodeArt: (...args: unknown[]) => mockUploadEpisodeArt(...args),
}))

const episode: Episode = {
  id: 10,
  season_id: 1,
  number: 3,
  title: 'Existing Episode',
  description: 'Some desc',
  guests: 'Alice',
  tags: 'tag1,tag2',
  cover_art_path: null,
  cover_art_thumb_path: null,
  duration_seconds: 0,
  publish_date: '2024-01-01',
  audio_type: 'url',
  audio_path: 'http://example.com/audio.mp3',
  hidden: false,
  created_at: '',
  updated_at: '',
}

// jsdom doesn't implement real media loading, so probeAudioDuration's
// `new Audio()` never actually fires loadedmetadata/error on its own.
// Stub the constructor with a controllable fake so tests can drive those
// events directly.
class FakeAudio {
  duration = 0
  src = ''
  private listeners: Record<string, Array<() => void>> = {}
  addEventListener(event: string, cb: () => void) {
    (this.listeners[event] ??= []).push(cb)
  }
  removeEventListener(event: string, cb: () => void) {
    this.listeners[event] = (this.listeners[event] ?? []).filter(l => l !== cb)
  }
  emit(event: string) {
    (this.listeners[event] ?? []).forEach(cb => cb())
  }
}
let fakeAudioInstances: FakeAudio[] = []

beforeEach(() => {
  vi.clearAllMocks()
  mockUploadAudio.mockReset()
  mockUploadEpisodeArt.mockReset()
  mockCreateEpisode.mockResolvedValue({ id: 99 })
  mockUpdateEpisode.mockResolvedValue({ id: 10 })

  fakeAudioInstances = []
  vi.stubGlobal('Audio', vi.fn(() => {
    const instance = new FakeAudio()
    fakeAudioInstances.push(instance)
    return instance
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('renders "New Episode" heading when no episode prop', () => {
  render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByText('New Episode')).toBeInTheDocument()
})

it('renders "Edit Episode" heading when episode prop provided', () => {
  render(<EpisodeFormPanel seasonId={1} episode={episode} onSave={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByText('Edit Episode')).toBeInTheDocument()
})

it('clicking Cancel calls onCancel', async () => {
  const onCancel = vi.fn()
  render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={onCancel} />)
  // Click the Cancel button (not the ✕ close button)
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onCancel).toHaveBeenCalledOnce()
})

it('renders all form fields', () => {
  render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/episode #/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/publish date/i)).toBeInTheDocument()
})

describe('audio type upload', () => {
  it('shows file input when audio type is upload', async () => {
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.selectOptions(screen.getByLabelText(/audio type/i), 'upload')
    expect(screen.getByLabelText(/audio file/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/audio url/i)).not.toBeInTheDocument()
  })

  it('shows url input when audio type is url', () => {
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText(/audio url/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/audio file/i)).not.toBeInTheDocument()
  })

  it('uploads file and populates audio_path on success', async () => {
    mockUploadAudio.mockResolvedValue({ path: '/audio/test-123.mp3' })
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.selectOptions(screen.getByLabelText(/audio type/i), 'upload')
    const fileInput = screen.getByLabelText(/audio file/i)
    const file = new File(['fake audio'], 'test.mp3', { type: 'audio/mpeg' })
    await userEvent.upload(fileInput, file)

    await waitFor(() => {
      expect(mockUploadAudio).toHaveBeenCalledWith(file)
      expect(screen.getByText(/uploaded:/i)).toBeInTheDocument()
    })
  })

  it('shows error when upload fails', async () => {
    mockUploadAudio.mockRejectedValue(new Error('Network error'))
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.selectOptions(screen.getByLabelText(/audio type/i), 'upload')
    const fileInput = screen.getByLabelText(/audio file/i)
    const file = new File(['fake audio'], 'test.mp3', { type: 'audio/mpeg' })
    await userEvent.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
    })
  })
})

describe('duration auto-detection', () => {
  it('detects duration from an uploaded file and includes it in the create payload', async () => {
    mockUploadAudio.mockResolvedValue({ path: '/audio/test-123.mp3' })
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.type(screen.getByLabelText(/title/i), 'New Ep')
    await userEvent.type(screen.getByLabelText(/episode #/i), '1')
    await userEvent.type(screen.getByLabelText(/publish date/i), '2024-01-01')
    await userEvent.selectOptions(screen.getByLabelText(/audio type/i), 'upload')

    const fileInput = screen.getByLabelText(/audio file/i)
    const file = new File(['fake audio'], 'test.mp3', { type: 'audio/mpeg' })
    await userEvent.upload(fileInput, file)

    await waitFor(() => expect(fakeAudioInstances).toHaveLength(1))
    fakeAudioInstances[0].duration = 754
    fakeAudioInstances[0].emit('loadedmetadata')

    await waitFor(() => {
      expect(screen.getByText('Duration: 12:34')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockCreateEpisode).toHaveBeenCalledWith(expect.objectContaining({ duration_seconds: 754 }))
    })
  })

  it('detects duration from an audio URL at submit time and includes it in the payload', async () => {
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.type(screen.getByLabelText(/title/i), 'New Ep')
    await userEvent.type(screen.getByLabelText(/episode #/i), '1')
    await userEvent.type(screen.getByLabelText(/publish date/i), '2024-01-01')
    await userEvent.type(screen.getByLabelText(/audio url/i), 'http://example.com/a.mp3')

    // Probing happens as part of submit (not eagerly on blur — a real
    // network fetch mid-typing was found to race with the Save click in
    // practice), so trigger it by clicking Save.
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fakeAudioInstances).toHaveLength(1))
    fakeAudioInstances[0].duration = 90
    fakeAudioInstances[0].emit('loadedmetadata')

    await waitFor(() => {
      expect(mockCreateEpisode).toHaveBeenCalledWith(expect.objectContaining({ duration_seconds: 90 }))
    })
  })

  it('falls back to durationchange when loadedmetadata reports Infinity (real MP3 browser behavior)', async () => {
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.type(screen.getByLabelText(/title/i), 'New Ep')
    await userEvent.type(screen.getByLabelText(/episode #/i), '1')
    await userEvent.type(screen.getByLabelText(/publish date/i), '2024-01-01')
    await userEvent.type(screen.getByLabelText(/audio url/i), 'http://example.com/no-duration-header.mp3')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fakeAudioInstances).toHaveLength(1))
    fakeAudioInstances[0].duration = Infinity
    fakeAudioInstances[0].emit('loadedmetadata')
    expect(mockCreateEpisode).not.toHaveBeenCalled()

    fakeAudioInstances[0].duration = 45
    fakeAudioInstances[0].emit('durationchange')

    await waitFor(() => {
      expect(mockCreateEpisode).toHaveBeenCalledWith(expect.objectContaining({ duration_seconds: 45 }))
    })
  })

  it('does not block saving when detection fails, and saves duration_seconds: 0', async () => {
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.type(screen.getByLabelText(/title/i), 'New Ep')
    await userEvent.type(screen.getByLabelText(/episode #/i), '1')
    await userEvent.type(screen.getByLabelText(/publish date/i), '2024-01-01')
    await userEvent.type(screen.getByLabelText(/audio url/i), 'http://example.com/unreachable.mp3')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fakeAudioInstances).toHaveLength(1))
    fakeAudioInstances[0].emit('error')

    await waitFor(() => {
      expect(mockCreateEpisode).toHaveBeenCalledWith(expect.objectContaining({ duration_seconds: 0 }))
    })
  })

  it('shows a CORS-aware hint when a URL-type probe fails at save time (issue #84)', async () => {
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.type(screen.getByLabelText(/title/i), 'New Ep')
    await userEvent.type(screen.getByLabelText(/episode #/i), '1')
    await userEvent.type(screen.getByLabelText(/publish date/i), '2024-01-01')
    await userEvent.type(screen.getByLabelText(/audio url/i), 'http://example.com/unreachable.mp3')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fakeAudioInstances).toHaveLength(1))
    fakeAudioInstances[0].emit('error')

    await waitFor(() => {
      expect(screen.getByText(/may not allow cross-origin/)).toBeInTheDocument()
    })
  })

  it('clears the CORS hint once the URL is edited again', async () => {
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.type(screen.getByLabelText(/title/i), 'New Ep')
    await userEvent.type(screen.getByLabelText(/episode #/i), '1')
    await userEvent.type(screen.getByLabelText(/publish date/i), '2024-01-01')
    await userEvent.type(screen.getByLabelText(/audio url/i), 'http://example.com/unreachable.mp3')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fakeAudioInstances).toHaveLength(1))
    fakeAudioInstances[0].emit('error')
    await waitFor(() => {
      expect(screen.getByText(/may not allow cross-origin/)).toBeInTheDocument()
    })

    await userEvent.type(screen.getByLabelText(/audio url/i), '2')
    expect(screen.queryByText(/may not allow cross-origin/)).not.toBeInTheDocument()
  })

  it('does not show the CORS hint when the probe succeeds', async () => {
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.type(screen.getByLabelText(/title/i), 'New Ep')
    await userEvent.type(screen.getByLabelText(/episode #/i), '1')
    await userEvent.type(screen.getByLabelText(/publish date/i), '2024-01-01')
    await userEvent.type(screen.getByLabelText(/audio url/i), 'http://example.com/a.mp3')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fakeAudioInstances).toHaveLength(1))
    fakeAudioInstances[0].duration = 90
    fakeAudioInstances[0].emit('loadedmetadata')

    await waitFor(() => {
      expect(mockCreateEpisode).toHaveBeenCalled()
    })
    expect(screen.queryByText(/may not allow cross-origin/)).not.toBeInTheDocument()
  })

  it('a failed re-probe on edit does not clobber a previously-known-good duration', async () => {
    render(<EpisodeFormPanel seasonId={1} episode={{ ...episode, duration_seconds: 200, audio_path: 'http://example.com/existing.mp3' }} onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fakeAudioInstances).toHaveLength(1))
    fakeAudioInstances[0].emit('error')

    await waitFor(() => {
      expect(mockUpdateEpisode).toHaveBeenCalledWith(10, expect.objectContaining({ duration_seconds: 200 }))
    })
  })

  it('pre-fills duration from an existing episode without re-probing', () => {
    render(<EpisodeFormPanel seasonId={1} episode={{ ...episode, duration_seconds: 120 }} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Duration: 2:00')).toBeInTheDocument()
    expect(fakeAudioInstances).toHaveLength(0)
  })
})

describe('cover art', () => {
  it('uploads an image and shows a preview thumbnail on success', async () => {
    mockUploadEpisodeArt.mockResolvedValue({ thumb: '/images/abc-thumb.webp', detail: '/images/abc-detail.webp' })
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)

    const fileInput = screen.getByLabelText(/cover art/i)
    const file = new File(['fake image'], 'cover.jpg', { type: 'image/jpeg' })
    await userEvent.upload(fileInput, file)

    await waitFor(() => {
      expect(mockUploadEpisodeArt).toHaveBeenCalledWith(file)
      expect(screen.getByAltText('Cover art preview')).toHaveAttribute('src', '/images/abc-thumb.webp')
    })
  })

  it('shows error when the art upload fails', async () => {
    mockUploadEpisodeArt.mockRejectedValue(new Error('Upload failed'))
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)

    const fileInput = screen.getByLabelText(/cover art/i)
    const file = new File(['fake image'], 'cover.jpg', { type: 'image/jpeg' })
    await userEvent.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText(/upload failed/i)).toBeInTheDocument()
    })
  })

  it('"Remove cover art" clears the preview and the stored paths', async () => {
    mockUploadEpisodeArt.mockResolvedValue({ thumb: '/images/abc-thumb.webp', detail: '/images/abc-detail.webp' })
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)

    const fileInput = screen.getByLabelText(/cover art/i)
    const file = new File(['fake image'], 'cover.jpg', { type: 'image/jpeg' })
    await userEvent.upload(fileInput, file)
    await waitFor(() => expect(screen.getByAltText('Cover art preview')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /remove cover art/i }))
    expect(screen.queryByAltText('Cover art preview')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove cover art/i })).not.toBeInTheDocument()
  })

  it('includes cover_art_path and cover_art_thumb_path in the create payload', async () => {
    mockUploadEpisodeArt.mockResolvedValue({ thumb: '/images/abc-thumb.webp', detail: '/images/abc-detail.webp' })
    render(<EpisodeFormPanel seasonId={1} onSave={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.type(screen.getByLabelText(/title/i), 'New Ep')
    await userEvent.type(screen.getByLabelText(/episode #/i), '1')
    await userEvent.type(screen.getByLabelText(/publish date/i), '2024-01-01')
    await userEvent.type(screen.getByLabelText(/audio url/i), 'http://example.com/a.mp3')

    const fileInput = screen.getByLabelText(/cover art/i)
    const file = new File(['fake image'], 'cover.jpg', { type: 'image/jpeg' })
    await userEvent.upload(fileInput, file)
    await waitFor(() => expect(screen.getByAltText('Cover art preview')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fakeAudioInstances).toHaveLength(1))
    fakeAudioInstances[0].emit('error')

    await waitFor(() => {
      expect(mockCreateEpisode).toHaveBeenCalledWith(expect.objectContaining({
        cover_art_path: '/images/abc-detail.webp',
        cover_art_thumb_path: '/images/abc-thumb.webp',
      }))
    })
  })

  it('pre-fills the preview from an existing episode\'s cover art', () => {
    render(<EpisodeFormPanel seasonId={1} episode={{ ...episode, cover_art_path: '/images/x-detail.webp', cover_art_thumb_path: '/images/x-thumb.webp' }} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByAltText('Cover art preview')).toHaveAttribute('src', '/images/x-thumb.webp')
  })
})
