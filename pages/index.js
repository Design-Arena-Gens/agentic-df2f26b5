import { useEffect, useMemo, useRef, useState } from 'react';

function secondsToMmSs(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function estimateReadingSeconds(text) {
  // ~150 wpm; adjustable
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  const seconds = (words / 150) * 60;
  return Math.max(10, Math.round(seconds));
}

function generateScriptFromIdea(idea) {
  if (!idea) return '';
  return [
    `Title: ${idea}`,
    '',
    'Hook: In this video, we explore the core idea in a practical and inspiring way.',
    '',
    'Intro: A quick overview of the problem, why it matters, and what we will cover.',
    '',
    'Body: Three concise points with examples and clear takeaways for the viewer.',
    '',
    'Conclusion: Summarize the key lesson and actionable next steps.',
    '',
    'Call to Action: Like, subscribe, and comment with your thoughts.',
  ].join('\n');
}

function generateImagePromptsFromIdea(idea) {
  if (!idea) return [];
  return [
    `${idea} concept art, minimal, high contrast`,
    `${idea} explained with simple shapes, infographic style`,
    `${idea} in action, cinematic wide shot`,
  ];
}

function chunkScriptToSlides(script) {
  const lines = (script || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
  const slides = [];
  let buffer = [];
  for (const line of lines) {
    buffer.push(line);
    if (buffer.join(' ').length > 140) {
      slides.push(buffer.join('\n'));
      buffer = [];
    }
  }
  if (buffer.length) slides.push(buffer.join('\n'));
  return slides.length ? slides : ['Untitled'];
}

function useBackgroundMusic({ enabled, bpm = 92, volume = 0.15 }) {
  const ctxRef = useRef(null);
  const musicGainRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;

    const musicGain = ctx.createGain();
    musicGain.gain.value = volume;
    musicGainRef.current = musicGain;

    // Simple drum + bass loop using oscillators and noise
    const master = ctx.createGain();
    master.connect(ctx.destination);
    musicGain.connect(master);

    const tempo = bpm; // beats per minute
    const beatDur = 60 / tempo; // seconds per beat

    let isStopped = false;

    function schedule() {
      if (!ctx || isStopped) return;
      const now = ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        const t = now + i * beatDur;
        // Kick
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
        gain.gain.setValueAtTime(0.9, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(gain).connect(musicGain);
        osc.start(t);
        osc.stop(t + 0.11);

        // Hat
        const hat = ctx.createOscillator();
        const hatGain = ctx.createGain();
        hat.type = 'square';
        hat.frequency.setValueAtTime(8000, t + 0.25 * beatDur);
        hatGain.gain.setValueAtTime(0.08, t + 0.25 * beatDur);
        hatGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25 * beatDur + 0.03);
        hat.connect(hatGain).connect(musicGain);
        hat.start(t + 0.25 * beatDur);
        hat.stop(t + 0.25 * beatDur + 0.035);

        // Bass note on downbeats
        if (i % 2 === 0) {
          const bass = ctx.createOscillator();
          const bassGain = ctx.createGain();
          bass.type = 'sawtooth';
          bass.frequency.setValueAtTime(55, t);
          bassGain.gain.setValueAtTime(0.15, t);
          bassGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
          bass.connect(bassGain).connect(musicGain);
          bass.start(t);
          bass.stop(t + 0.31);
        }
      }
      setTimeout(schedule, beatDur * 1000 * 4 * 0.9);
    }

    schedule();

    return () => {
      isStopped = true;
      try { ctx.close(); } catch {}
      ctxRef.current = null;
    };
  }, [enabled, bpm, volume]);

  return { audioContext: ctxRef.current, musicGainNode: musicGainRef.current };
}

export default function Home() {
  const [ideasInput, setIdeasInput] = useState('AI productivity hacks\nStorytelling tips for YouTube');
  const [sheetCsvUrl, setSheetCsvUrl] = useState('');
  const [ideas, setIdeas] = useState([]);

  const [selectedIdeaIndex, setSelectedIdeaIndex] = useState(0);
  const selectedIdea = ideas[selectedIdeaIndex] || '';

  const [script, setScript] = useState('');
  const [imagePrompts, setImagePrompts] = useState([]);

  const slides = useMemo(() => chunkScriptToSlides(script), [script]);
  const [targetDurationSec, setTargetDurationSec] = useState(120);

  const [autoMusic, setAutoMusic] = useState(true);
  const [bpm, setBpm] = useState(92);
  const [musicVol, setMusicVol] = useState(0.15);

  const canvasRef = useRef(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  const { audioContext, musicGainNode } = useBackgroundMusic({ enabled: isPreviewing || isRecording ? autoMusic : false, bpm, volume: musicVol });

  useEffect(() => {
    if (!script) setTargetDurationSec(estimateReadingSeconds(script));
  }, [script]);

  async function loadIdeas() {
    const lines = ideasInput.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const fetched = [...lines];
    if (sheetCsvUrl) {
      try {
        const res = await fetch(sheetCsvUrl);
        const csv = await res.text();
        csv.split(/\n+/).forEach((row, idx) => {
          const first = row.split(',')[0];
          if (idx === 0 && /idea/i.test(first)) return; // skip header
          if (first && !/^https?:/i.test(first)) fetched.push(first.trim());
        });
      } catch (e) {
        console.warn('CSV load failed', e);
      }
    }
    const unique = Array.from(new Set(fetched));
    setIdeas(unique);
    setSelectedIdeaIndex(0);
    setScript(generateScriptFromIdea(unique[0] || ''));
    setImagePrompts(generateImagePromptsFromIdea(unique[0] || ''));
  }

  function drawSlideToCanvas(ctx, w, h, text, idx) {
    // Gradient background
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, `hsl(${(idx * 47) % 360} 80% 20%)`);
    g.addColorStop(1, `hsl(${(idx * 47 + 120) % 360} 80% 40%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Animated overlay shapes
    for (let i = 0; i < 12; i++) {
      const t = performance.now() / 1000;
      const a = (i / 12) * Math.PI * 2 + t * 0.2;
      const r = Math.min(w, h) * (0.1 + (i % 3) * 0.07);
      const x = w / 2 + Math.cos(a) * r;
      const y = h / 2 + Math.sin(a) * r;
      ctx.fillStyle = `hsla(${(idx * 47 + i * 15) % 360} 90% 70% / 0.15)`;
      ctx.beginPath();
      ctx.arc(x, y, 40 + (i % 5) * 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Text
    ctx.fillStyle = 'white';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 8;
    const lines = text.split(/\n/);
    const baseSize = Math.max(20, Math.min(64, Math.floor(w / 20)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const total = lines.length;
    for (let i = 0; i < lines.length; i++) {
      ctx.font = `700 ${baseSize}px system-ui, -apple-system, Segoe UI, Roboto`;
      const line = lines[i];
      const y = h / 2 + (i - (total - 1) / 2) * (baseSize * 1.4);
      const metrics = ctx.measureText(line);
      const scale = Math.min(1, (w * 0.9) / (metrics.width + 1));
      ctx.save();
      ctx.translate(w / 2, y);
      ctx.scale(scale, Math.pow(scale, 0.85));
      ctx.fillText(line, 0, 0);
      ctx.restore();
    }

    ctx.shadowBlur = 0;
  }

  function startPreview() {
    if (isPreviewing) return;
    setIsPreviewing(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let rafId = 0;
    let start = performance.now();

    const duration = Math.max(5, targetDurationSec);
    const perSlide = duration / Math.max(1, slides.length);

    function frame() {
      const w = canvas.width = canvas.clientWidth * devicePixelRatio;
      const h = canvas.height = canvas.clientHeight * devicePixelRatio;
      const elapsed = (performance.now() - start) / 1000;
      const index = Math.min(slides.length - 1, Math.floor(elapsed / perSlide));
      drawSlideToCanvas(ctx, w, h, slides[index], index);
      rafId = requestAnimationFrame(frame);
    }

    frame();

    return () => cancelAnimationFrame(rafId);
  }

  async function startRecording() {
    if (isRecording) return;
    setRecordedUrl('');
    setIsRecording(true);

    const canvas = canvasRef.current;
    const canvasStream = canvas.captureStream(30);

    // Audio: use WebAudio to combine background music and optional mic
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const destination = audioCtx.createMediaStreamDestination();

    // Route music if enabled
    if (autoMusic && musicGainNode) {
      try { musicGainNode.disconnect(); } catch {}
      try { musicGainNode.connect(destination); } catch {}
    }

    // Optional mic
    let micStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const micSource = audioCtx.createMediaStreamSource(micStream);
      const micGain = audioCtx.createGain();
      micGain.gain.value = 0.9;
      micSource.connect(micGain).connect(destination);
    } catch (e) {
      console.warn('Mic not available, proceeding without voiceover');
    }

    const mixedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);

    const recorder = new MediaRecorder(mixedStream, { mimeType: 'video/webm;codecs=vp9,opus' });
    const chunks = [];

    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

    const duration = Math.max(5, targetDurationSec);
    const perSlide = duration / Math.max(1, slides.length);
    const ctx = canvas.getContext('2d');
    let start = performance.now();

    function drawLoop() {
      const w = canvas.width = canvas.clientWidth * devicePixelRatio;
      const h = canvas.height = canvas.clientHeight * devicePixelRatio;
      const elapsed = (performance.now() - start) / 1000;
      const index = Math.min(slides.length - 1, Math.floor(elapsed / perSlide));
      drawSlideToCanvas(ctx, w, h, slides[index], index);
      if (elapsed < duration) requestAnimationFrame(drawLoop);
    }

    drawLoop();
    recorder.start(250);

    await new Promise(resolve => setTimeout(resolve, duration * 1000));

    recorder.stop();
    await new Promise(resolve => recorder.onstop = resolve);

    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    setRecordedUrl(url);
    setThumbnailUrl(await captureThumbnail(canvas));
    setIsRecording(false);

    try { await audioCtx.close(); } catch {}
    try { micStream && micStream.getTracks().forEach(t => t.stop()); } catch {}
  }

  async function captureThumbnail(canvas) {
    const thumbCanvas = document.createElement('canvas');
    const w = 1280, h = 720;
    thumbCanvas.width = w;
    thumbCanvas.height = h;
    const ctx = thumbCanvas.getContext('2d');
    drawSlideToCanvas(ctx, w, h, slides[0] || 'Thumbnail', 0);
    return thumbCanvas.toDataURL('image/png');
  }

  function download(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  useEffect(() => {
    if (!ideas.length) loadIdeas();
  }, []);

  return (
    <div className="container">
      <h1>AI Automation YouTube Workflow (Client-side)</h1>
      <p className="small">Zero-server demo: generate script, slides, record video, and download. Optional YouTube upload requires your own credentials.</p>

      <div className="row">
        <div className="card">
          <div className="section-title">1) Ideas Source</div>
          <label>Quick ideas (one per line)</label>
          <textarea value={ideasInput} onChange={e => setIdeasInput(e.target.value)} />
          <div className="grid">
            <div>
              <label>Google Sheets CSV URL (optional)</label>
              <input placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv" value={sheetCsvUrl} onChange={e => setSheetCsvUrl(e.target.value)} />
              <div className="small">Sheet must be published to the web as CSV.</div>
            </div>
          </div>
          <div className="actions" style={{ marginTop: 8 }}>
            <button className="secondary" onClick={loadIdeas}>Load Ideas</button>
          </div>

          <hr />
          <label>Ideas</label>
          <select value={selectedIdeaIndex} onChange={e => setSelectedIdeaIndex(Number(e.target.value))}>
            {ideas.map((idea, i) => (
              <option key={i} value={i}>{idea}</option>
            ))}
          </select>
        </div>

        <div className="card">
          <div className="section-title">2) Script & Image Prompts</div>
          <div className="actions">
            <button className="secondary" onClick={() => setScript(generateScriptFromIdea(selectedIdea))}>Auto-generate Script</button>
            <button className="secondary" onClick={() => setImagePrompts(generateImagePromptsFromIdea(selectedIdea))}>Auto-generate Prompts</button>
          </div>
          <label>Script</label>
          <textarea value={script} onChange={e => setScript(e.target.value)} />
          <div className="small">Estimated read time: {secondsToMmSs(estimateReadingSeconds(script))}</div>

          <label style={{ marginTop: 8 }}>Image Prompts (for reference)</label>
          <textarea value={imagePrompts.join('\n')} onChange={e => setImagePrompts(e.target.value.split(/\n+/))} />

          <div className="grid" style={{ marginTop: 8 }}>
            <div>
              <label>Target Duration (seconds)</label>
              <input type="number" value={targetDurationSec} onChange={e => setTargetDurationSec(Number(e.target.value || 0))} />
            </div>
            <div>
              <label>Auto Background Music</label>
              <select value={autoMusic ? 'on' : 'off'} onChange={e => setAutoMusic(e.target.value === 'on')}>
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </div>
            <div>
              <label>BPM</label>
              <input type="number" value={bpm} onChange={e => setBpm(Number(e.target.value || 60))} />
            </div>
            <div>
              <label>Music Volume</label>
              <input type="range" min="0" max="1" step="0.01" value={musicVol} onChange={e => setMusicVol(Number(e.target.value))} />
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-title">3) Slides Preview & Recording</div>
        <div className="actions">
          <button className="secondary" onClick={() => startPreview()}>Start Preview</button>
          <button className="primary" disabled={isRecording} onClick={startRecording}>{isRecording ? 'Recording?' : 'Record Video'}</button>
          {recordedUrl && <button className="success" onClick={() => download(recordedUrl, 'video.webm')}>Download Video</button>}
          {thumbnailUrl && <button className="secondary" onClick={() => download(thumbnailUrl, 'thumbnail.png')}>Download Thumbnail</button>}
        </div>
        <div className="small">Tip: Allow microphone to auto-generate voiceover by reading your script aloud while recording.</div>
        <div style={{ width: '100%', aspectRatio: '16 / 9', background: '#0b1220', borderRadius: 8, overflow: 'hidden', border: '1px solid #0b1a2a', marginTop: 8 }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="section-title">4) YouTube Scheduling (Optional)</div>
          <p className="small">Upload requires a Google OAuth Client ID with YouTube Data API enabled. Enter your Client ID and authenticate to upload and schedule directly from the browser.</p>
          <YouTubeUploader />
        </div>
        <div className="card">
          <div className="section-title">Slides (auto-split)</div>
          <ol>
            {slides.map((s, i) => (
              <li key={i} className="small" style={{ marginBottom: 6 }}>
                <div className="mono" style={{ whiteSpace: 'pre-wrap' }}>{s}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}

function YouTubeUploader() {
  const [clientId, setClientId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [title, setTitle] = useState('My Automated Video');
  const [description, setDescription] = useState('Generated by AI workflow.');
  const [tags, setTags] = useState('ai,automation,workflow');
  const [publishAt, setPublishAt] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [status, setStatus] = useState('');

  function authenticate() {
    if (!clientId) return alert('Enter Client ID');
    /* global google */
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = authenticate;
      document.body.appendChild(script);
      return;
    }
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube',
      callback: (resp) => {
        if (resp && resp.access_token) setAccessToken(resp.access_token);
      },
    });
    tokenClient.requestAccessToken();
  }

  async function uploadVideo() {
    if (!accessToken) return alert('Authenticate first');
    if (!videoFile) return alert('Choose a video file');

    setStatus('Starting upload?');

    const metadata = {
      snippet: {
        title,
        description,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      },
      status: publishAt ? { privacyStatus: 'private', publishAt: new Date(publishAt).toISOString() } : { privacyStatus: 'public' },
    };

    // Initiate resumable upload
    const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': videoFile.size,
        'X-Upload-Content-Type': videoFile.type || 'video/webm',
      },
      body: JSON.stringify(metadata),
    });

    if (!initRes.ok) {
      const err = await initRes.text();
      setStatus('Init failed: ' + err);
      return;
    }

    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) { setStatus('No upload URL'); return; }

    setStatus('Uploading?');

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': videoFile.type || 'video/webm' },
      body: videoFile,
    });

    const json = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok) {
      setStatus('Upload failed: ' + JSON.stringify(json));
      return;
    }

    const videoId = json.id;
    setStatus('Uploaded video ID: ' + videoId);

    if (thumbnailFile) {
      setStatus('Setting thumbnail?');
      const thumbRes = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?uploadType=media&videoId=${videoId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: thumbnailFile,
      });
      if (!thumbRes.ok) {
        const tErr = await thumbRes.text();
        setStatus('Thumbnail failed: ' + tErr);
      } else {
        setStatus(s => s + ' Thumbnail set.');
      }
    }
  }

  return (
    <div className="grid">
      <div className="grid">
        <div>
          <label>Google OAuth Client ID</label>
          <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" />
        </div>
        <div className="actions">
          <button className="secondary" onClick={authenticate}>Authenticate</button>
          {accessToken && <span className="small">Authenticated</span>}
        </div>
      </div>
      <div className="row">
        <div>
          <label>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label>Publish At (optional, ISO local)</label>
          <input type="datetime-local" value={publishAt} onChange={e => setPublishAt(e.target.value)} />
        </div>
      </div>
      <div>
        <label>Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div>
        <label>Tags (comma separated)</label>
        <input value={tags} onChange={e => setTags(e.target.value)} />
      </div>
      <div className="row">
        <div>
          <label>Video File</label>
          <input type="file" accept="video/*" onChange={e => setVideoFile(e.target.files?.[0] || null)} />
        </div>
        <div>
          <label>Thumbnail File</label>
          <input type="file" accept="image/*" onChange={e => setThumbnailFile(e.target.files?.[0] || null)} />
        </div>
      </div>
      <div className="actions">
        <button className="primary" onClick={uploadVideo}>Upload to YouTube</button>
        <span className="small mono">{status}</span>
      </div>
    </div>
  );
}
