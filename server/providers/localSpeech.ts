import { execFile } from 'node:child_process';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config.js';

// This fixed program never inserts spoken text into PowerShell source.
const speechProgram = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speechText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:INSIGHTOS_SPEECH_TEXT))
$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voice = $speech.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'en-US' -and $_.VoiceInfo.Gender -eq 'Female' } | Select-Object -First 1
  if ($voice) { $speech.SelectVoice($voice.VoiceInfo.Name) }
  $speech.Rate = 1
  $speech.SetOutputToWaveFile($env:INSIGHTOS_SPEECH_OUTPUT)
  $speech.Speak($speechText)
} finally { $speech.Dispose() }
`;

export const hasLocalSpeech = (cfg: Config) =>
  process.platform === 'win32' && ['127.0.0.1', 'localhost', '::1'].includes(cfg.host);

export async function localSpeech(cfg: Config, text: string, parent: AbortSignal): Promise<Buffer> {
  if (!hasLocalSpeech(cfg))
    throw new Error('Voice backup is available only in the local Windows app.');
  if (!text || text.length > 3000)
    throw new Error('Voice backup text must be between 1 and 3000 characters.');
  const directory = path.join(cfg.localDir, 'voice');
  await mkdir(directory, { recursive: true });
  const output = path.join(directory, crypto.randomUUID() + '.wav');
  const signal = AbortSignal.any([parent, AbortSignal.timeout(25000)]);
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          Buffer.from(speechProgram, 'utf16le').toString('base64'),
        ],
        {
          windowsHide: true,
          signal,
          maxBuffer: 16384,
          env: {
            ...process.env,
            INSIGHTOS_SPEECH_TEXT: Buffer.from(text, 'utf8').toString('base64'),
            INSIGHTOS_SPEECH_OUTPUT: output,
          },
        },
        (error) => (error ? reject(error) : resolve()),
      );
    });
    signal.throwIfAborted();
    const audio = await readFile(output);
    if (
      audio.length < 44 ||
      audio.subarray(0, 4).toString() !== 'RIFF' ||
      audio.subarray(8, 12).toString() !== 'WAVE'
    )
      throw new Error('Voice backup returned invalid audio.');
    return audio;
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof Error && error.message.startsWith('Voice backup')) throw error;
    throw new Error(
      'Voice backup could not start. Check that Windows has an installed speech voice.',
    );
  } finally {
    await unlink(output).catch(() => {});
  }
}
