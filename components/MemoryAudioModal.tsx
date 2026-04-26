import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioEntry } from '../types/memory';

const ICON_STROKE = 1.5;
const FONT_BODY = '"Roboto Mono", ui-monospace, monospace';

const BUILTIN_MUSIC_LIBRARY = [
  {
    id: 'builtin-amazing-grace',
    title: '奇异恩典纯音乐',
    url: '/audio/amazing-grace-instrumental.mp3',
  },
  {
    id: 'builtin-qinghuo',
    title: '青火纯音乐 - 黄子弘凡',
    url: '/audio/qinghuo-instrumental.mp3',
  },
  {
    id: 'builtin-do-u',
    title: 'Do U纯音乐 - 黄子弘凡',
    url: '/audio/do-u-instrumental.mp3',
  },
] as const;

function randomTrack() {
  return BUILTIN_MUSIC_LIBRARY[Math.floor(Math.random() * BUILTIN_MUSIC_LIBRARY.length)];
}

function makeEntryFromFile(file: File, kind: 'audio' | 'music', title?: string): AudioEntry {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${kind}-${Date.now()}`,
    kind,
    title: title || file.name,
    url: URL.createObjectURL(file),
    createdAt: new Date().toISOString(),
    source: kind === 'audio' ? 'recording' : 'upload',
    file,
  };
}

function makeBuiltinMusicEntry(track: (typeof BUILTIN_MUSIC_LIBRARY)[number]): AudioEntry {
  return {
    id: track.id,
    kind: 'music',
    title: track.title,
    url: track.url,
    createdAt: new Date().toISOString(),
    source: 'builtin',
  };
}

export interface MemoryAudioModalProps {
  open: boolean;
  currentEntries: AudioEntry[];
  onClose: () => void;
  onSave: (entries: AudioEntry[]) => void;
}

export const MemoryAudioModal: React.FC<MemoryAudioModalProps> = ({
  open,
  currentEntries,
  onClose,
  onSave,
}) => {
  const [draftEntries, setDraftEntries] = useState<AudioEntry[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioUploadRef = useRef<HTMLInputElement>(null);
  const musicUploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraftEntries(currentEntries);
    setRecording(false);
    setRecordingError(null);
  }, [open, currentEntries]);

  const stopRecorderTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      stopRecorderTracks();
    }
    setRecording(false);
    onClose();
  }, [onClose, stopRecorderTracks]);

  const handleRecordToggle = useCallback(async () => {
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError('This browser does not support live audio recording.');
      return;
    }
    try {
      setRecordingError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const file = new File(
          [blob],
          `live-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`,
          { type: blob.type || 'audio/webm' }
        );
        setDraftEntries((prev) => [...prev, makeEntryFromFile(file, 'audio', `Live recording ${prev.length + 1}`)]);
        stopRecorderTracks();
      };
      recorder.start();
      setRecording(true);
    } catch (error) {
      setRecording(false);
      setRecordingError(error instanceof Error ? error.message : 'Unable to start recording.');
      stopRecorderTracks();
    }
  }, [recording, stopRecorderTracks]);

  const handleAudioUpload = useCallback((file: File | null) => {
    if (!file || !file.type.startsWith('audio/')) return;
    setDraftEntries((prev) => [...prev, makeEntryFromFile(file, 'audio')]);
  }, []);

  const handleMusicUpload = useCallback((file: File | null) => {
    if (!file || !file.type.startsWith('audio/')) return;
    const entry = makeEntryFromFile(file, 'music');
    entry.source = 'upload';
    setDraftEntries((prev) => [...prev, entry]);
  }, []);

  const randomBuiltinTitle = useMemo(() => {
    const selected = draftEntries.filter((entry) => entry.source === 'builtin' && entry.kind === 'music');
    return selected.length ? selected[selected.length - 1].title : null;
  }, [draftEntries]);

  const removeEntry = useCallback((id: string) => {
    setDraftEntries((prev) => {
      const target = prev.find((entry) => entry.id === id);
      if (target && target.source !== 'builtin' && target.url.startsWith('blob:')) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((entry) => entry.id !== id);
    });
  }, []);

  if (!open) return null;

  const audioEntries = draftEntries.filter((entry) => entry.kind === 'audio');
  const musicEntries = draftEntries.filter((entry) => entry.kind === 'music');

  return (
    <div
      className="fixed inset-0 z-[135] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.42)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <input
        ref={audioUploadRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => handleAudioUpload(e.target.files?.[0] ?? null)}
      />
      <input
        ref={musicUploadRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => handleMusicUpload(e.target.files?.[0] ?? null)}
      />

      <div
        className="bg-white w-full max-w-[720px] min-h-[620px] border border-black shadow-xl rounded-none overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ fontFamily: FONT_BODY, fontWeight: 400 }}
      >
        <div className="px-6 pt-5 pb-4">
          <button
            type="button"
            className="text-[16px] text-[#5a5a5a] bg-transparent border-0 cursor-pointer"
            onClick={handleClose}
          >
            &lt; Back to map
          </button>
        </div>

        <div className="px-6 pb-6 space-y-7 flex-1">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="m-0 text-[18px] font-normal text-[#4f4f4f]">Audio</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="h-9 w-9 bg-transparent border-0 flex items-center justify-center cursor-pointer hover:opacity-75"
                  aria-label="Upload audio file"
                  onClick={() => audioUploadRef.current?.click()}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
                    <path d="M12 10v6M9 13h6" />
                  </svg>
                </button>
                <a
                  href="https://drive.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 bg-transparent border-0 flex items-center justify-center text-black hover:opacity-75"
                  aria-label="Import audio from drive"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="m7 10 5-5 5 5" />
                    <path d="M12 5v10" />
                  </svg>
                </a>
              </div>
            </div>

            <button
              type="button"
              className="w-full min-h-[190px] border border-dashed border-black/45 bg-[#fafafa] rounded-none flex flex-col items-center justify-center gap-4 cursor-pointer"
              onClick={() => void handleRecordToggle()}
            >
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span className="text-[18px]">{recording ? 'Stop recording' : 'Live recording'}</span>
            </button>
            {recordingError && <p className="mt-2 mb-0 text-[12px] text-red-600">{recordingError}</p>}
            {audioEntries.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {audioEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="px-3 py-2 border border-black bg-white text-left text-[12px] hover:bg-neutral-50"
                    onClick={() => removeEntry(entry.id)}
                  >
                    {entry.title} ×
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="m-0 text-[18px] font-normal text-[#4f4f4f]">Music</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="h-9 w-9 bg-transparent border-0 flex items-center justify-center cursor-pointer hover:opacity-75"
                  aria-label="Upload music file"
                  onClick={() => musicUploadRef.current?.click()}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
                    <path d="M12 10v6M9 13h6" />
                  </svg>
                </button>
                <a
                  href="https://drive.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 bg-transparent border-0 flex items-center justify-center text-black hover:opacity-75"
                  aria-label="Import music from drive"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="m7 10 5-5 5 5" />
                    <path d="M12 5v10" />
                  </svg>
                </a>
              </div>
            </div>

            <div className="w-full min-h-[230px] border border-dashed border-black/45 bg-[#fafafa] rounded-none p-5">
              <div className="flex flex-col items-center justify-center gap-3 mb-5 text-[#5a5a5a]">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="5" width="14" height="14" rx="3" />
                  <circle cx="9" cy="9" r="0.8" fill="currentColor" />
                  <circle cx="15" cy="9" r="0.8" fill="currentColor" />
                  <circle cx="12" cy="15" r="0.8" fill="currentColor" />
                  <circle cx="9" cy="15" r="0.8" fill="currentColor" />
                  <circle cx="15" cy="15" r="0.8" fill="currentColor" />
                </svg>
                <button
                  type="button"
                  className="text-[18px] bg-transparent border-0 cursor-pointer text-inherit"
                  onClick={() => {
                    const track = randomTrack();
                    setDraftEntries((prev) => {
                      const withoutBuiltins = prev.filter((entry) => !(entry.source === 'builtin' && entry.kind === 'music'));
                      return [...withoutBuiltins, makeBuiltinMusicEntry(track)];
                    });
                  }}
                >
                  Random choosing
                </button>
              </div>
              {randomBuiltinTitle && (
                <div className="w-full px-3 py-3 border border-black bg-white text-left text-[13px]">
                  {randomBuiltinTitle}
                </div>
              )}
              <p className="mt-3 mb-0 text-[11px] text-[#6b6b6b]">
                Put licensed files into <code>public/audio/</code> to enable the preset tracks in production.
              </p>
            </div>

            {musicEntries.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {musicEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="px-3 py-2 border border-black bg-white text-left text-[12px] hover:bg-neutral-50"
                    onClick={() => removeEntry(entry.id)}
                  >
                    {entry.title} ×
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="border-t border-black/20 px-6 py-4 flex justify-end">
          <button
            type="button"
            className="px-5 py-2 border border-black bg-white text-black text-sm hover:bg-neutral-100 rounded-none"
            style={{ borderWidth: 1.5 }}
            onClick={() => onSave(draftEntries)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
