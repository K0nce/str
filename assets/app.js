import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js'
import { updateProfile } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js'
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js'
import { getStorage, ref, uploadBytesResumable, getDownloadURL, listAll } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js'

const firebaseConfig = {
  // apiKey: "...",
  // authDomain: "...",
  // projectId: "...",
  // storageBucket: "...",
  // messagingSenderId: "...",
  // appId: "..."
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)
const storage = getStorage(app)

const firebaseConfigured = !!(firebaseConfig && firebaseConfig.apiKey)

const googleProvider = new GoogleAuthProvider()
const appleProvider = new OAuthProvider('apple.com')

// auth UI
const authView = document.getElementById('authView')
const appView = document.getElementById('appView')
const sharedView = document.getElementById('sharedView')
const googleLoginBtn = document.getElementById('googleLoginBtn')
const appleLoginBtn = document.getElementById('appleLoginBtn')
const emailAuthForm = document.getElementById('emailAuthForm')
const authEmail = document.getElementById('authEmail')
const authPassword = document.getElementById('authPassword')
const signInBtn = document.getElementById('signInBtn')
const signUpBtn = document.getElementById('signUpBtn')
// signup form (new UI)
const signupForm = document.getElementById('signupForm')
const signupEmail = document.getElementById('signupEmail')
const signupPassword = document.getElementById('signupPassword')
const fullNameInput = document.getElementById('fullName')
const logoutBtn = document.getElementById('logoutBtn')
const userLabel = document.getElementById('userLabel')
const userEmail = document.getElementById('userEmail')

// folders UI
const newFolderName = document.getElementById('newFolderName')
const createFolderBtn = document.getElementById('createFolderBtn')
const folderList = document.getElementById('folderList')
const activeFolderTitle = document.getElementById('activeFolderTitle')
const activeFolderInfo = document.getElementById('activeFolderInfo')
const shareLinkBtn = document.getElementById('shareLinkBtn')
const shareQrBtn = document.getElementById('shareQrBtn')
const uploadZone = document.getElementById('uploadZone')
const chooseFilesBtn = document.getElementById('chooseFilesBtn')
const fileInput = document.getElementById('fileInput')
const uploadProgress = document.getElementById('uploadProgress')
const fileList = document.getElementById('fileList')

// shared folder view
const sharedFolderInfo = document.getElementById('sharedFolderInfo')
const sharedFiles = document.getElementById('sharedFiles')

// qr
const qrDialog = document.getElementById('qrDialog')
const qrCode = document.getElementById('qrCode')
const closeQrBtn = document.getElementById('closeQrBtn')

const baseUrl = location.origin + location.pathname.replace(/index\.html?$/i, '')
const sharedRouteActive = /share=/.test(location.hash || '')

let currentUser = null
let activeFolderId = null
let activeFolderMeta = null
let folderUnsub = null
let filesUnsub = null
let sharedFolderId = null
let sharedFolderToken = null
let sharedFilesUnsub = null
const folderCache = new Map()

function showAuth() {
  authView.classList.remove('hidden')
  appView.classList.add('hidden')
  sharedView.classList.add('hidden')
}

function showApp() {
  authView.classList.add('hidden')
  appView.classList.remove('hidden')
  sharedView.classList.add('hidden')
}

function showShared() {
  authView.classList.add('hidden')
  appView.classList.add('hidden')
  sharedView.classList.remove('hidden')
}

if (googleLoginBtn) {
  googleLoginBtn.addEventListener('click', async () => {
    if (!firebaseConfigured) return alert('Firebase config not set. Wklej swoje firebaseConfig w assets/app.js')
    try { await signInWithPopup(auth, googleProvider) } catch (e) { alert(e.message) }
  })
}

if (appleLoginBtn) {
  appleLoginBtn.addEventListener('click', async () => {
    if (!firebaseConfigured) return alert('Firebase config not set. Wklej swoje firebaseConfig w assets/app.js')
    try { await signInWithPopup(auth, appleProvider) } catch (e) { alert(e.message) }
  })
}

// Legacy email form handlers (optional UI) — guard existence
  if (emailAuthForm && authEmail && authPassword) {
  emailAuthForm.addEventListener('submit', async e => {
    e.preventDefault()
    if (!firebaseConfigured) return alert('Firebase config not set. Wklej swoje firebaseConfig w assets/app.js')
    try {
      await createUserWithEmailAndPassword(auth, authEmail.value.trim(), authPassword.value)
    } catch (e) {
      alert(e.message)
    }
  })
}

if (signInBtn && authEmail && authPassword) {
  signInBtn.addEventListener('click', async () => {
    if (!firebaseConfigured) return alert('Firebase config not set. Wklej swoje firebaseConfig w assets/app.js')
    try {
      await signInWithEmailAndPassword(auth, authEmail.value.trim(), authPassword.value)
    } catch (e) {
      alert(e.message)
    }
  })
}

// New signup form (from the new UI)
if (signupForm && signupEmail && signupPassword) {
  signupForm.addEventListener('submit', async e => {
    e.preventDefault()
    const email = signupEmail.value.trim()
    const pwd = signupPassword.value
    const name = (fullNameInput && fullNameInput.value.trim()) || ''
    if (!email || !pwd) return alert('Podaj e-mail i hasło')
    try {
      if (!firebaseConfigured) return alert('Firebase config not set. Wklej swoje firebaseConfig w assets/app.js')
      const cred = await createUserWithEmailAndPassword(auth, email, pwd)
      if (name && cred.user) {
        try { await updateProfile(cred.user, { displayName: name }) } catch (err) { console.warn('updateProfile failed', err) }
      }
      // onAuthStateChanged will switch view and subscribe
    } catch (err) {
      alert(err.message)
    }
  })
}

logoutBtn.addEventListener('click', () => signOut(auth))

onAuthStateChanged(auth, async user => {
  currentUser = user || null
  if (sharedRouteActive) return
  if (!user) {
    // Do not force-open the auth panel on page load; stay on landing.
    authView.classList.add('hidden')
    appView.classList.add('hidden')
    sharedView.classList.add('hidden')
    return
  }
  userLabel.textContent = user.displayName || 'Moje konto'
  userEmail.textContent = user.email || user.uid
  showApp()
  await ensureUserDoc(user)
  await subscribeFolders(user.uid)
})

// Header buttons: open auth panel or quick social sign-in
const headerLoginBtn = document.getElementById('headerLoginBtn')
const headerSignupBtn = document.getElementById('headerSignupBtn')
const headerGoogleBtn = document.getElementById('headerGoogleBtn')
const headerAppleBtn = document.getElementById('headerAppleBtn')

// show config banner if not configured
const configWarning = document.getElementById('configWarning')
const copyConfigBtn = document.getElementById('copyConfigBtn')
if (!firebaseConfigured && configWarning) {
  configWarning.classList.remove('hidden')
  if (copyConfigBtn) copyConfigBtn.addEventListener('click', async () => {
    const sample = `const firebaseConfig = {\n  apiKey: "YOUR_API_KEY",\n  authDomain: "YOUR_PROJECT.firebaseapp.com",\n  projectId: "YOUR_PROJECT_ID",\n  storageBucket: "YOUR_PROJECT.appspot.com",\n  messagingSenderId: "SENDER_ID",\n  appId: "APP_ID"\n}`
    try { await navigator.clipboard.writeText(sample); alert('Skopiowano przykładowy config. Wklej go do assets/app.js i uzupełnij wartości.') } catch (e) { alert('Nie udało się skopiować: ' + e.message) }
  })
}

if (headerLoginBtn) headerLoginBtn.addEventListener('click', () => {
  authView.classList.remove('hidden')
  appView.classList.add('hidden')
  sharedView.classList.add('hidden')
})
if (headerSignupBtn) headerSignupBtn.addEventListener('click', () => {
  authView.classList.remove('hidden')
  appView.classList.add('hidden')
  sharedView.classList.add('hidden')
  // focus on signup email if present
  const e = document.getElementById('signupEmail')
  if (e) e.focus()
})
// quick social buttons in header (optional) — fall back to social buttons in form
if (headerGoogleBtn) headerGoogleBtn.addEventListener('click', async () => { try { await signInWithPopup(auth, googleProvider) } catch(e){ alert(e.message) } })
if (headerAppleBtn) headerAppleBtn.addEventListener('click', async () => { try { await signInWithPopup(auth, appleProvider) } catch(e){ alert(e.message) } })

async function ensureUserDoc(user) {
  const userRef = doc(db, 'users', user.uid)
  const snap = await getDoc(userRef)
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email || null,
      name: user.displayName || null,
      createdAt: serverTimestamp(),
    })
  }
}

createFolderBtn.addEventListener('click', async () => {
  if (!currentUser) return
  const name = newFolderName.value.trim()
  if (!name) return
  const folder = {
    ownerId: currentUser.uid,
    name,
    isPublic: false,
    shareToken: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  const folderRef = await addDoc(collection(db, 'folders'), folder)
  activeFolderId = folderRef.id
  newFolderName.value = ''
  await setDoc(doc(db, 'folders', folderRef.id), { publicId: folderRef.id }, { merge: true })
  await subscribeFiles(folderRef.id)
}

async function subscribeFolders(uid) {
  if (folderUnsub) folderUnsub()
  const q = query(collection(db, 'folders'), where('ownerId', '==', uid), orderBy('createdAt', 'desc'))
  folderUnsub = onSnapshot(q, snap => {
    const folders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    folders.forEach(folder => folderCache.set(folder.id, folder))
    renderFolders(folders)
    if (!activeFolderId && folders.length) {
      selectFolder(folders[0].id, folders[0].name)
    }
  })
}

function renderFolders(folders = []) {
  folderList.innerHTML = ''
  if (!folders.length) {
    folderList.innerHTML = '<div class="tiny">Brak folderów</div>'
    return
  }
  folders.forEach(folder => {
    const row = document.createElement('div')
    row.className = 'folder-item'
    row.innerHTML = `
      <button class="folder-btn ${folder.id === activeFolderId ? 'active' : ''}" data-id="${folder.id}">
        <strong>${escapeHtml(folder.name)}</strong>
        <div class="tiny">${folder.isPublic ? 'Publiczny' : 'Prywatny'}</div>
      </button>
    `
    row.querySelector('button').addEventListener('click', () => selectFolder(folder.id, folder.name))
    folderList.appendChild(row)
  })
}

async function selectFolder(id, name) {
  activeFolderId = id
  activeFolderMeta = folderCache.get(id) || { name }
  activeFolderTitle.textContent = name
  activeFolderInfo.textContent = `${activeFolderMeta.isPublic ? 'Publiczny' : 'Prywatny'} • Folder: ${id}`
  shareLinkBtn.disabled = false
  shareQrBtn.disabled = false
  await subscribeFiles(id)
  if (folderUnsub) {
    // keep folders listener running
  }
}

async function subscribeFiles(folderId) {
  if (filesUnsub) filesUnsub()
  const q = query(collection(db, 'folders', folderId, 'files'), orderBy('createdAt', 'desc'))
  filesUnsub = onSnapshot(q, async snap => {
    const files = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    await renderFiles(files)
  })
}

async function renderFiles(files = []) {
  fileList.innerHTML = ''
  if (!files.length) {
    fileList.innerHTML = '<div class="tiny">Brak plików w folderze</div>'
    return
  }
  for (const file of files) {
    const row = document.createElement('div')
    row.className = 'file-item'
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(file.name)}</strong>
        <div class="tiny">${file.size ? (file.size / 1024 / 1024).toFixed(2) + ' MB' : ''}</div>
      </div>
      <div class="file-actions">
        <a class="btn small" href="${file.downloadUrl}" target="_blank" rel="noopener">Pobierz</a>
      </div>
    `
    fileList.appendChild(row)
  }
}

chooseFilesBtn.addEventListener('click', () => fileInput.click())
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('hover') })
uploadZone.addEventListener('dragleave', e => { e.preventDefault(); uploadZone.classList.remove('hover') })
uploadZone.addEventListener('drop', async e => {
  e.preventDefault()
  uploadZone.classList.remove('hover')
  if (!activeFolderId) return alert('Wybierz folder')
  const files = Array.from(e.dataTransfer?.files || [])
  if (files.length) await uploadFiles(activeFolderId, files)
})

fileInput.addEventListener('change', async e => {
  if (!activeFolderId) return alert('Wybierz folder')
  const files = Array.from(e.target.files || [])
  if (files.length) await uploadFiles(activeFolderId, files)
  fileInput.value = ''
})

async function uploadFiles(folderId, files) {
  for (const file of files) {
    const node = document.createElement('div')
    node.className = 'file-progress'
    node.innerHTML = `
      <div class="file-info">
        <strong>${escapeHtml(file.name)}</strong>
        <div class="file-meta">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
      </div>
      <div style="width:40%"><div class="progress-bar"><i></i></div></div>
    `
    uploadProgress.prepend(node)

    const uploadRef = ref(storage, `folders/${folderId}/${Date.now()}_${file.name}`)
    const task = uploadBytesResumable(uploadRef, file)
    const url = await new Promise((resolve, reject) => {
      task.on('state_changed', snap => {
        const pct = (snap.bytesTransferred / snap.totalBytes) * 100
        node.querySelector('.progress-bar > i').style.width = pct + '%'
      }, reject, async () => resolve(await getDownloadURL(task.snapshot.ref)))
    })

    await addDoc(collection(db, 'folders', folderId, 'files'), {
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      storagePath: uploadRef.fullPath,
      downloadUrl: url,
      createdAt: serverTimestamp(),
    })
    node.querySelector('.file-meta').innerHTML = `<a href="${url}" target="_blank" rel="noopener">Pobierz</a>`
  }
}

shareLinkBtn.addEventListener('click', async () => {
  if (!activeFolderId) return
  const folderRef = doc(db, 'folders', activeFolderId)
  const token = crypto.randomUUID().replace(/-/g, '')
  await setDoc(folderRef, { isPublic: true, shareToken: token, updatedAt: serverTimestamp() }, { merge: true })
  activeFolderMeta = { ...(activeFolderMeta || {}), isPublic: true, shareToken: token }
  folderCache.set(activeFolderId, activeFolderMeta)
  const url = `${baseUrl}#share=${activeFolderId}&token=${token}`
  await navigator.clipboard.writeText(url)
  alert('Link skopiowany')
})

shareQrBtn.addEventListener('click', () => {
  if (!activeFolderId) return
  const token = activeFolderMeta?.shareToken || ''
  const url = `${baseUrl}#share=${activeFolderId}&token=${token}`
  qrCode.innerHTML = ''
  // QRCode is loaded from a small CDN script in index.html
  if (window.QRCode) {
    new window.QRCode(qrCode, {
      text: url,
      width: 220,
      height: 220,
      colorDark: '#0b1220',
      colorLight: '#ffffff',
      correctLevel: window.QRCode.CorrectLevel.M,
    })
  } else {
    qrCode.textContent = url
  }
  qrDialog.showModal()
})

closeQrBtn.addEventListener('click', () => qrDialog.close())

async function bootSharedFolderFromHash() {
  const hash = location.hash || ''
  const match = hash.match(/share=([^&]+)(?:&token=([^&]+))?/) 
  if (!match) return false
  sharedFolderId = match[1]
  sharedFolderToken = match[2] || null
  showShared()
  const folderSnap = await getDoc(doc(db, 'folders', sharedFolderId))
  if (!folderSnap.exists()) {
    sharedFolderInfo.textContent = 'Folder nie istnieje'
    return true
  }
  const folder = folderSnap.data()
  if (!folder.isPublic) {
    sharedFolderInfo.textContent = 'Folder nie jest publiczny'
    return true
  }
  if (folder.shareToken && sharedFolderToken && folder.shareToken !== sharedFolderToken) {
    sharedFolderInfo.textContent = 'Nieprawidłowy kod udostępniania'
    return true
  }
  sharedFolderInfo.textContent = folder.name || sharedFolderId
  const q = query(collection(db, 'folders', sharedFolderId, 'files'), orderBy('createdAt', 'desc'))
  if (sharedFilesUnsub) sharedFilesUnsub()
  sharedFilesUnsub = onSnapshot(q, snap => {
    sharedFiles.innerHTML = ''
    const files = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    if (!files.length) {
      sharedFiles.innerHTML = '<div class="tiny">Brak plików</div>'
      return
    }
    files.forEach(file => {
      const row = document.createElement('div')
      row.className = 'shared-item'
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(file.name)}</strong>
          <div class="tiny">${file.size ? (file.size / 1024 / 1024).toFixed(2) + ' MB' : ''}</div>
        </div>
        <a class="btn small" href="${file.downloadUrl}" target="_blank" rel="noopener">Pobierz</a>
      `
      sharedFiles.appendChild(row)
    })
  })
  return true
}

function escapeHtml(s) {
  return String(s).replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

bootSharedFolderFromHash()
