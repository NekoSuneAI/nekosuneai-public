const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { Blob, File } = require('buffer')
const { fetch: undiciFetch, Headers, Request, Response } = require("undici");

if (typeof globalThis.fetch !== "function") {
  globalThis.fetch = undiciFetch;
  globalThis.Headers = Headers;
  globalThis.Request = Request;
  globalThis.Response = Response;
}

async function fetchAsBuffer (url) {
  const res = await axios.get(url, { responseType: 'arraybuffer' })
  return Buffer.from(res.data)
}

async function fetchAsFile (url, filename, mime = 'application/octet-stream') {
  const buffer = await fetchAsBuffer(url)
  return new File([buffer], filename, { type: mime })
}

async function fetchAsBlob (url) {
  const buffer = await fetchAsBuffer(url)
  return new Blob([buffer])
}

async function convertWithRvc ({
  audioBuffer,
  rvcModel,
  pitch = 0,
  primaryUrl,
  fallbackModelBaseUrl,
  fallbackModelBasePath,
  fallbackClientUrl,
  fallbackEnabled = true,
  primaryOptions = {},
  debug = false
}) {
  if (!audioBuffer) throw new Error('audioBuffer is required')
  if (!rvcModel) throw new Error('rvcModel is required')
  if (!primaryUrl) throw new Error('primaryUrl is required')

  const { Client } = await import('@gradio/client')

  // ✅ MUST be File, not Blob
  const audioFile = new File([audioBuffer], 'input.wav', {
    type: 'audio/wav'
  })

  const normalizedPrimaryUrl = primaryUrl.replace(/\/+$/, '')

  try {
    if (debug) console.warn(`[RVC][primary] connect -> ${normalizedPrimaryUrl}`)
    const client = await Client.connect(normalizedPrimaryUrl)

    const result = await client.predict('/process_audio', {
      audio_path: audioFile,
      model_name: rvcModel,
      pitch,
      f0method: "harvest",
      index_rate: 0.5,
      filter_radius: 3,
      rms_mix_rate: 1,
      protect: 0.33,
      device: "cuda:0",
      ...primaryOptions
    })

    const fileUrl = result?.data?.[0]?.url
    if (!fileUrl) throw new Error('Primary missing output URL')

    return await fetchAsBuffer(fileUrl)
  } catch (primaryErr) {
    console.warn(`[RVC] Primary failed → ${primaryErr.message}`)

    if (!fallbackEnabled) throw primaryErr

    let pthFile, indexFile

    if (fallbackModelBasePath) {
      const basePath = path.resolve(fallbackModelBasePath, rvcModel)
      pthFile = new File(
        [await fs.promises.readFile(path.join(basePath, 'model.pth'))],
        'model.pth'
      )
      indexFile = new File(
        [await fs.promises.readFile(path.join(basePath, 'model.index'))],
        'model.index'
      )
    } else {
      const baseUrl = (
        fallbackModelBaseUrl ||
        'https://huggingface.co/nekosunebot/rvc_voices/resolve/main'
      ).replace(/\/+$/, '')

      pthFile = await fetchAsFile(
        `${baseUrl}/${rvcModel}/model.pth`,
        'model.pth'
      )

      indexFile = await fetchAsFile(
        `${baseUrl}/${rvcModel}/model.index`,
        'model.index'
      )
    }

    const fallbackSpace = fallbackClientUrl || 'r3gm/rvc_zero'
    if (debug) console.warn(`[RVC][fallback] connect -> ${fallbackSpace}`)

    const client = await Client.connect(fallbackSpace)

    const result = await client.predict('/run', {
      audio_files: [audioFile],
      file_m: pthFile,
      file_index: indexFile,
      pitch_alg: 'rmvpe+',
      pitch_lvl: pitch,
      index_inf: 0.75,
      r_m_f: 3,
      e_r: 0.25,
      c_b_p: 0.5,
      active_noise_reduce: false,
      audio_effects: false,
      type_output: 'wav',
      steps: 1
    })

    const fileUrl = result?.data?.[0]?.url
    if (!fileUrl) throw new Error('Fallback missing output URL')

    return await fetchAsBuffer(fileUrl)
  }
}

module.exports = {
  convertWithRvc
}
