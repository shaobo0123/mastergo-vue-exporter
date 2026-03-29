import type { AssetExportBundle, AssetManifestEntry } from '@lib/types'
import { sanitizeFileName } from '@lib/utils'

type ZipEntry = {
  path: string
  bytes: Uint8Array
}

const CRC32_TABLE = createCrc32Table()

export function downloadAssetBundle(bundle: AssetExportBundle) {
  const zipBlob = buildAssetBundleZip(bundle)
  const fileName = `${sanitizeFileName(bundle.componentName, 'generated-assets')}-generated-assets.zip`
  downloadBlob(zipBlob, fileName)
}

function buildAssetBundleZip(bundle: AssetExportBundle): Blob {
  const encoder = new TextEncoder()
  const manifestPath = 'generated-assets/assets.manifest.json'
  const manifestBytes = encoder.encode(JSON.stringify(bundle.manifest, null, 2))
  const assetEntries = bundle.manifest.assets.map((asset) => ({
    path: `generated-assets/${asset.fileName}`,
    bytes: toAssetBytes(asset, encoder),
  }))

  const entries: ZipEntry[] = [
    {
      path: manifestPath,
      bytes: manifestBytes,
    },
    ...assetEntries,
  ]

  return createZipBlob(entries)
}

function toAssetBytes(asset: AssetManifestEntry, encoder: TextEncoder): Uint8Array {
  if (asset.encoding === 'base64') {
    return decodeBase64(asset.content)
  }
  return encoder.encode(asset.content)
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function createZipBlob(entries: ZipEntry[]): Blob {
  const localChunks: Uint8Array[] = []
  const centralChunks: Uint8Array[] = []
  let offset = 0

  entries.forEach((entry) => {
    const pathBytes = new TextEncoder().encode(entry.path)
    const crc = crc32(entry.bytes)
    const localHeader = new Uint8Array(30 + pathBytes.length)
    const localView = new DataView(localHeader.buffer)

    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, 0, true)
    localView.setUint16(12, 0, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, entry.bytes.length, true)
    localView.setUint32(22, entry.bytes.length, true)
    localView.setUint16(26, pathBytes.length, true)
    localView.setUint16(28, 0, true)
    localHeader.set(pathBytes, 30)

    localChunks.push(localHeader, entry.bytes)

    const centralHeader = new Uint8Array(46 + pathBytes.length)
    const centralView = new DataView(centralHeader.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, 0, true)
    centralView.setUint16(14, 0, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, entry.bytes.length, true)
    centralView.setUint32(24, entry.bytes.length, true)
    centralView.setUint16(28, pathBytes.length, true)
    centralView.setUint16(30, 0, true)
    centralView.setUint16(32, 0, true)
    centralView.setUint16(34, 0, true)
    centralView.setUint16(36, 0, true)
    centralView.setUint32(38, 0, true)
    centralView.setUint32(42, offset, true)
    centralHeader.set(pathBytes, 46)

    centralChunks.push(centralHeader)
    offset += localHeader.length + entry.bytes.length
  })

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const endHeader = new Uint8Array(22)
  const endView = new DataView(endHeader.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(4, 0, true)
  endView.setUint16(6, 0, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)
  endView.setUint16(20, 0, true)

  return new Blob([...localChunks, ...centralChunks, endHeader], { type: 'application/zip' })
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff

  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256)

  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }

  return table
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
