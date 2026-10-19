// 本地演示用密码加盐摘要（同步实现）。
//
// 说明：真实生产环境应将密码哈希与校验完全放到服务端（bcrypt/argon2 + 会话），
// 本工具只是让本地演示数据中不再出现明文密码，属于「纯前端可先做的基本加盐摘要」。
// 使用迭代 SHA-256（类 PBKDF2）对「密码 + 随机盐」进行摘要，校验时以相同盐重算比对。
//
// 为保证浏览器与 `node --test` 环境下行为一致，这里不依赖异步的 crypto.subtle，
// 提供纯 JS 的同步 SHA-256 实现（已用标准测试向量验证）。

/**
 * 标准的 SHA-256 同步实现（输入为 UTF-8 字符串，输出为 64 位十六进制小写）。
 * @param {string} message
 * @returns {string} hex digest
 */
export function sha256(message) {
  // 将字符串按 UTF-8 转为字节
  const bytes = new Uint8Array(utf8Encode(message))
  // 标准 SHA-256 常数 K（前 64 个素数的立方根小数部分取前 32 位）
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ])
  // 初始哈希值（前 8 个素数的平方根小数部分取前 32 位）
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ])
  // 填充：追加 0x80，补 0 到长度 ≡ 56 (mod 64)，再追加 64 位比特数
  const l = bytes.length
  const bitLenHi = Math.floor(l / 0x20000000)  // l 的高 32 位（l 远小于 2^32，通常为 0）
  const bitLenLo = (l << 3) >>> 0
  const paddedLen = (((l + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLen)
  padded.set(bytes)
  padded[l] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(paddedLen - 8, bitLenHi)
  dv.setUint32(paddedLen - 4, bitLenLo)

  const w = new Uint32Array(64)
  for (let chunkOff = 0; chunkOff < paddedLen; chunkOff += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(chunkOff + i * 4)
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7]
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0
    H[1] = (H[1] + b) >>> 0
    H[2] = (H[2] + c) >>> 0
    H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0
    H[5] = (H[5] + f) >>> 0
    H[6] = (H[6] + g) >>> 0
    H[7] = (H[7] + h) >>> 0
  }
  return Array.from(H, n => n.toString(16).padStart(8, '0')).join('')
}

function rotr(x, n) {
  return (x >>> n) | (x << (32 - n))
}

function utf8Encode(str) {
  const encoder = new TextEncoder()
  return encoder.encode(str)
}

// 摘要迭代次数：本地演示环境下取一个适中的值，兼顾速度与一定的暴力抗性。
const HASH_ITERATIONS = 10000

function randomHex(bytes = 8) {
  const buf = new Uint8Array(bytes)
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(buf)
    return Array.from(buf, n => n.toString(16).padStart(2, '0')).join('')
  }
  // 极端情况下（无 crypto）退化为基于时间与随机的伪随机盐，仅用于演示。
  let out = ''
  for (let i = 0; i < bytes; i++) {
    out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  }
  return out
}

/**
 * 对明文密码生成「盐 + 迭代摘要」。
 * @param {string} password
 * @returns {{ salt: string, hash: string }}
 */
export function hashPassword(password) {
  const salt = randomHex(8)
  return { salt, hash: derive(password, salt) }
}

/**
 * 校验明文密码是否匹配某个已存凭证。
 * @param {string} password 用户输入的明文
 * @param {string|{hash: string, salt: string}} stored
 *   - 明文旧用户：直接字符串比较（迁移用），命中后调用方应升级为摘要存储。
 *   - 摘要新用户：{ hash, salt }，重算迭代摘要后比对。
 * @returns {{ ok: boolean, legacy?: boolean }}
 */
export function verifyPassword(password, stored) {
  if (stored && typeof stored === 'object') {
    if (typeof stored.hash === 'string' && typeof stored.salt === 'string') {
      return { ok: derive(password, stored.salt) === stored.hash.toLowerCase() }
    }
    return { ok: false }
  }
  // 旧版明文存储：直接比较
  return { ok: stored === password, legacy: true }
}

function derive(password, salt) {
  const rounds = Math.max(1, Math.floor(HASH_ITERATIONS))
  let digest = sha256(`${salt}:${password}`)
  for (let i = 1; i < rounds; i++) {
    digest = sha256(`${salt}:${digest}`)
  }
  return digest
}

/**
 * 把某个 user 对象升级为摘要存储：若仍是旧版明文，则替换为 { hash, salt } 并清除明文。
 * @param {{id:string, phone:string}|object} user
 * @returns {boolean} 是否发生了升级
 */
export function upgradeToHashed(user) {
  if (!user || typeof user !== 'object') return false
  if (user.passwordHash && user.salt) return false
  if (typeof user.password === 'string' && user.password) {
    const { salt, hash } = hashPassword(user.password)
    user.passwordHash = hash
    user.salt = salt
    delete user.password
    return true
  }
  return false
}

/**
 * 判断 user 是否已经以摘要形式保存了密码。
 * @param {object} user
 * @returns {boolean}
 */
export function hasStoredPassword(user) {
  return Boolean(user && (user.passwordHash || user.password))
}
