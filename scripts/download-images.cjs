// Download a manifest of { url, file } image pairs into public/images/web.
// Usage: node scripts/download-images.js
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'public', 'images', 'web')

// url -> local filename (kept short & safe)
const MANIFEST = {
  // ---------- HomeView backgrounds (4) ----------
  'https://pic.rmb.bdstatic.com/bjh/cms/240716/8ad88f863094e25a5d68e83d38efe82b_1721100655.5156_375.jpeg': 'home-bg-1.jpg',
  'https://img-baofun.zhhainiao.com/fs/36ad84f4b3d047758d0b511b6a10bcf7.jpg': 'home-bg-2.jpg',
  'https://img0.baidu.com/it/u=2222632481,182571043&fm=253&fmt=auto&app=138&f=JPEG?w=889&h=500': 'home-bg-3.jpg',
  'https://img2.baidu.com/it/u=3188739469,4254670530&fm=253&fmt=auto&app=120&f=JPEG?w=1422&h=800': 'home-bg-4.jpg',

  // ---------- HomeView nav cards (7) ----------
  'https://pic.rmb.bdstatic.com/bjh/news/449d1ca673335ddb00d9e3d5fc7be51a.png': 'nav-1.png',
  'https://qcloud.dpfile.com/pc/L1b6vXGp-EF-dFQ4uWw7rK9kifSEhqsbrLDdLVwvq57LFpsPyn_LVe45mh7Q5HrA.jpg': 'nav-2.jpg',
  'https://qcloud.dpfile.com/pc/VTpIKjEjmJ35OYWV2YzxOugM6fXZYGQroGimW05NkfHxFSC0ofrhC9zwMlfBTCHs.jpg': 'nav-3.jpg',
  'https://qcloud.dpfile.com/pc/cPtCyE-pRHGSrv9jJhbNmVtkCAUPhLjMdrcHOAVWLOBQqusOJ_ESiPdf_7my1mHB.jpg': 'nav-4.jpg',
  'https://miaobi-lite.bj.bcebos.com/miaobi/5mao/b%275bm/5bee5pyA576O5aSc5pmv5omT5Y2h5ZywXzE3Mjg5NTEwMDAuOTYzODI4OA%3D%3D%27/0.png': 'nav-5.png',
  'https://img0.baidu.com/it/u=2613236660,640886220&fm=253&app=138&f=JPEG?w=1200&h=800': 'nav-6.jpg',
  'https://img1.baidu.com/it/u=2251132733,1850680916&fm=253&app=138&f=JPEG?w=800&h=1067': 'nav-7.jpg',

  // ---------- AttractionsView (10) ----------
  'https://photo.tuchong.com/15409024/f/572967472.jpg': 'attr-1.jpg',
  'https://photo.tuchong.com/1569409/f/779033462.jpg': 'attr-2.jpg',
  'https://q3.itc.cn/q_70/images03/20240907/764b8a02e8a241d79485774f05b1583d.jpeg': 'attr-3.jpeg',
  'https://img1.baidu.com/it/u=798131433,3488446238&fm=253&fmt=auto&app=138&f=JPEG?w=888&h=500': 'attr-4.jpg',
  'https://qcloud.dpfile.com/pc/BVEHCVLneTClFEzplE__3Y1GKcqFK-0xQKKbH9-GALhOvnLpWKfeEkt4lRrW2v6K.jpg': 'attr-5.jpg',
  'https://q7.itc.cn/q_70/images01/20241121/7d5f0d8352e64bd6a68b10eb2641e451.jpeg': 'attr-6.jpeg',
  'https://copyright.bdstatic.com/vcg/creative/5acbb36f2a00c2a077961d569a8a9e58.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw==': 'attr-7.jpg',
  'https://gips2.baidu.com/it/u=1435897543,244848408&fm=3074&app=3074&f=JPEG?w=800&h=1067&type=normal&func=TS': 'attr-8.jpg',
  'https://www.xinhuanet.com/politics/2015-09/15/128230888_14422845350251n.jpg': 'attr-9.jpg',
  'https://img2.baidu.com/it/u=3994314339,1738836353&fm=253&app=138&f=JPEG?w=800&h=1422': 'attr-10.jpg',
  'https://qcloud.dpfile.com/pc/SMgDAyTX4nxcl7YwsXZsGABupPObdT87GpUk1dHvVPTKaTfKBfUpTf0iXLGXr7FVY0q73sB2DyQcgmKUxZFQtw.jpg': 'attr-11.jpg',
  'https://img2.baidu.com/it/u=2572633534,2845505348&fm=253&fmt=auto&app=138&f=JPEG?w=729&h=1276': 'attr-12.jpg',

  // ---------- RoutesView covers (4) ----------
  'https://copyright.bdstatic.com/vcg/creative/1aceea7f204b2475d79dc874233bbd82.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw==': 'route-1.jpg',
  'https://copyright.bdstatic.com/vcg/creative/fa3d00f2dd0d2d2fc5b7f6e5d8ce63a1.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw==': 'route-2.jpg',
  'https://copyright.bdstatic.com/vcg/creative/10f2f032f8b98f0778c11ae5c7d5d8e6.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw==': 'route-3.jpg',
  'https://copyright.bdstatic.com/vcg/creative/6fbe34e3cf19cecf03b10c9736f66e00.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw==': 'route-4.jpg',

  // ---------- HotelsView (** 3 deal images kept, no local source) ----------
  // hero + main hotel images are unsplash; see below

  // ---------- ProfileView orders (4, unsplash dups already counted) ----------
}

// Unsplash hotels list (hero + 8 hotels), deduped by photo id
const UNSPLASH_HOTELS = [
  ['1566073771259-6a8506099945', 'hotel-1.jpg'],
  ['1551882547-ff40c63fe5fa', 'hotel-2.jpg'],
  ['1542314831-068cd1dbfeeb', 'hotel-3.jpg'],
  ['1520250497591-112f2f40a3f4', 'hotel-4.jpg'],
  ['1445019980597-93fa8acb246c', 'hotel-5.jpg'],
  ['1571896349842-33c89424de2d', 'hotel-6.jpg'],
  ['1564501049412-61c2a3083791', 'hotel-7.jpg'],
  ['1582719478250-c89cae4dc85b', 'hotel-8.jpg'],
]
const UNSPLASH_PROFILE = [
  ['1566073771259-6a8506099945', 'order-profile-1.jpg'],
  ['1551882547-ff40c63fe5fa', 'order-profile-2.jpg'],
]

// TicketsView picsum scenic images (id 1..10) => these are random stock, use placeholder-like local copies
const PICS = {}
for (let i = 1; i <= 10; i++) {
  PICS[`https://picsum.photos/id/${i}/400/300`] = `scenic-${i}.jpg`
}

function request(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Referer': url,
    }
    const req = mod.get(url, { headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) {
        if (res.headers.location) {
          resolve(request(new URL(res.headers.location, url).href))
          return
        }
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })
    req.on('error', reject)
    req.setTimeout(20000, () => { req.destroy(new Error('timeout')) })
  })
}

async function download(name, url) {
  const outPath = path.join(OUT_DIR, name)
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
    return { name, ok: true, skipped: true }
  }
  try {
    const buf = await request(url)
    if (buf.length < 100) return { name, ok: false, err: `too small (${buf.length}B)` }
    fs.writeFileSync(outPath, buf)
    return { name, ok: true, bytes: buf.length }
  } catch (e) {
    return { name, ok: false, err: e.message }
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const tasks = []

  for (const [url, name] of Object.entries(MANIFEST)) {
    tasks.push({ url, name })
  }
  for (const [id, name] of UNSPLASH_HOTELS) {
    tasks.push({ url: `https://images.unsplash.com/photo-${id}?w=800&q=80`, name })
  }
  for (const [id, name] of UNSPLASH_PROFILE) {
    tasks.push({ url: `https://images.unsplash.com/photo-${id}?w=800&q=80`, name })
  }
  for (const [url, name] of Object.entries(PICS)) {
    tasks.push({ url, name })
  }

  // concurrency batch
  const results = []
  const CONC = 6
  for (let i = 0; i < tasks.length; i += CONC) {
    const batch = tasks.slice(i, i + CONC)
    results.push(...await Promise.all(batch.map(t => download(t.name, t.url))))
  }

  const ok = results.filter(r => r.ok)
  const fail = results.filter(r => !r.ok)
  console.log(`\n===== DONE: ${ok.length} ok, ${fail.length} failed =====`)
  ok.forEach(r => console.log(`OK   ${r.name}${r.bytes ? ` (${r.bytes}B)` : ' (skipped)'}`))
  fail.forEach(r => console.log(`FAIL ${r.name}  ${r.err}`))

  fs.writeFileSync(path.join(__dirname, 'download-result.json'), JSON.stringify({ ok: ok.map(r=>r.name), fail }, null, 2))
}

main()
