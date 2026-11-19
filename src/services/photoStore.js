// 手账照片存储在 IndexedDB，不写入 localStorage，避免图片挤占行程数据空间。
export const PHOTO_DB_NAME = 'travel-journal-photos'
export const PHOTO_DB_VERSION = 1
export const PHOTO_STORE = 'photos'
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const PHOTO_MAX_EDGE = 1600

export function isPhotoStorageAvailable() {
  return typeof indexedDB !== 'undefined'
}

export function validatePhotoFile(file) {
  if (!file || typeof file !== 'object') return { valid: false, message: '请选择照片' }
  if (!PHOTO_TYPES.includes(file.type)) return { valid: false, message: '仅支持 JPEG、PNG 或 WebP 照片' }
  if (!Number.isFinite(file.size) || file.size <= 0) return { valid: false, message: '照片内容为空' }
  if (file.size > PHOTO_MAX_BYTES) return { valid: false, message: '单张照片需小于 8MB' }
  return { valid: true, message: '' }
}

function openDb(factory = globalThis.indexedDB) {
  if (!factory) return Promise.reject(new Error('当前浏览器不支持照片存储'))
  return new Promise((resolve, reject) => {
    const request = factory.open(PHOTO_DB_NAME, PHOTO_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, { keyPath: 'id' })
        store.createIndex('ownerId', 'ownerId')
        store.createIndex('entryId', 'entryId')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('无法打开照片存储，请检查浏览器存储权限'))
    request.onblocked = () => reject(new Error('照片存储被其他页面占用，请关闭其他标签页后重试'))
  })
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('照片存储读写失败，请检查浏览器存储空间'))
  })
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(new Error('照片存储写入失败，请检查浏览器存储空间'))
    transaction.onabort = () => reject(new Error('照片存储写入被中止'))
  })
}

export async function compressImage(file, { maxEdge = PHOTO_MAX_EDGE, quality = 0.82 } = {}) {
  if (typeof createImageBitmap !== 'function') throw new Error('当前浏览器不支持图片压缩，请换用较新的浏览器')
  if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') throw new Error('当前环境不支持图片压缩')
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height, 1))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    let canvas, context
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(width, height)
      context = canvas.getContext('2d')
    } else {
      canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      context = canvas.getContext('2d')
    }
    if (!context) throw new Error('无法处理照片，请换用较新的浏览器')
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = canvas.convertToBlob
      ? await canvas.convertToBlob({ type: 'image/jpeg', quality })
      : await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) throw new Error('照片压缩失败，请重试')
    return { blob, width, height }
  } finally {
    bitmap.close?.()
  }
}

// 保存前校验并压缩，元数据随记录返回，便于列表展示尺寸与大小。
export async function savePhoto({ ownerId, entryId, file, factory = globalThis.indexedDB, compress = compressImage }) {
  if (typeof ownerId !== 'string' || !ownerId) throw new Error('请先登录再保存照片')
  if (typeof entryId !== 'string' || !entryId) throw new Error('请先保存手账再添加照片')
  const check = validatePhotoFile(file)
  if (!check.valid) throw new Error(check.message)
  const { blob, width, height } = await compress(file)
  const photo = {
    id: `${entryId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    ownerId,
    entryId,
    name: typeof file.name === 'string' && file.name ? file.name.slice(0, 120) : '照片.jpg',
    type: blob.type || 'image/jpeg',
    size: blob.size,
    width,
    height,
    createdAt: new Date().toISOString(),
    blob
  }
  const db = await openDb(factory)
  try {
    const transaction = db.transaction(PHOTO_STORE, 'readwrite')
    transaction.objectStore(PHOTO_STORE).put(photo)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
  return { ...photo, blob: undefined }
}

export async function listPhotos(ownerId, entryId, factory = globalThis.indexedDB) {
  if (typeof ownerId !== 'string' || !ownerId) return []
  const db = await openDb(factory)
  try {
    const transaction = db.transaction(PHOTO_STORE, 'readonly')
    const index = transaction.objectStore(PHOTO_STORE).index('entryId')
    const rows = await requestResult(index.getAll(entryId))
    return rows
      .filter(row => row && row.ownerId === ownerId && row.entryId === entryId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  } finally {
    db.close()
  }
}

export async function getPhoto(id, factory = globalThis.indexedDB) {
  if (typeof id !== 'string' || !id) return null
  const db = await openDb(factory)
  try {
    const transaction = db.transaction(PHOTO_STORE, 'readonly')
    return (await requestResult(transaction.objectStore(PHOTO_STORE).get(id))) || null
  } finally {
    db.close()
  }
}

export async function deletePhoto(id, factory = globalThis.indexedDB) {
  if (typeof id !== 'string' || !id) return false
  const db = await openDb(factory)
  try {
    const transaction = db.transaction(PHOTO_STORE, 'readwrite')
    transaction.objectStore(PHOTO_STORE).delete(id)
    await transactionDone(transaction)
    return true
  } finally {
    db.close()
  }
}

export async function deletePhotosForEntry(ownerId, entryId, factory = globalThis.indexedDB) {
  const photos = await listPhotos(ownerId, entryId, factory)
  for (const photo of photos) await deletePhoto(photo.id, factory)
  return photos.length
}
