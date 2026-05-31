export const config = {
  runtime: 'nodejs',
};

function buildSpeakerTranscript(data) {
  const segments = Array.isArray(data?.segments) ? data.segments : [];
  if (!segments.length) return data?.text || data?.transcript || '';

  const speakerMap = new Map();
  let speakerCount = 0;
  const getLabel = (speaker) => {
    const raw = speaker == null ? 'unknown' : String(speaker);
    if (!speakerMap.has(raw)) {
      speakerCount += 1;
      speakerMap.set(raw, `Hablante ${speakerCount}`);
    }
    return speakerMap.get(raw);
  };

  const blocks = [];
  let currentSpeaker = null;
  let currentText = [];

  for (const seg of segments) {
    const label = getLabel(seg.speaker ?? seg.speaker_id ?? seg.speaker_label);
    const text = String(seg.text || '').trim();
    if (!text) continue;
    if (label !== currentSpeaker) {
      if (currentSpeaker && currentText.length) {
        blocks.push(`${currentSpeaker}:\n${currentText.join(' ').trim()}`);
      }
      currentSpeaker = label;
      currentText = [text];
    } else {
      currentText.push(text);
    }
  }
  if (currentSpeaker && currentText.length) {
    blocks.push(`${currentSpeaker}:\n${currentText.join(' ').trim()}`);
  }
  return blocks.join('\n\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Falta configurar OPENAI_API_KEY en Vercel.' });
    }

    const { audioBase64, mimeType = 'audio/webm', fileName = 'audio.webm', language = 'es' } = req.body || {};
    if (!audioBase64) {
      return res.status(400).json({ error: 'No llegó audio para transcribir.' });
    }

    const buffer = Buffer.from(audioBase64, 'base64');
    const blob = new Blob([buffer], { type: mimeType });
    const form = new FormData();
    form.append('file', blob, fileName);
    form.append('model', 'gpt-4o-transcribe-diarize');
    form.append('response_format', 'diarized_json');
    if (language) form.append('language', language);

    const openaiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const rawText = await openaiResponse.text();
    let data;
    try { data = JSON.parse(rawText); } catch { data = { text: rawText }; }

    if (!openaiResponse.ok) {
      const message = data?.error?.message || rawText || 'Error del servicio de transcripción.';
      return res.status(openaiResponse.status).json({ error: message });
    }

    const transcript = buildSpeakerTranscript(data);
    return res.status(200).json({ transcript, raw: data });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Error inesperado al transcribir.' });
  }
}
