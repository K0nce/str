import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js'
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
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js'

const firebaseConfig = {
  // apiKey: '...',
  // authDomain: '...',
  // projectId: '...',
  // storageBucket: '...',
  // messagingSenderId: '...',
  // appId: '...'
}

const firebaseConfigured = !!(firebaseConfig && firebaseConfig.apiKey)
const localMode = !firebaseConfigured

let app = null
let auth = null
let db = null
let storage = null
let googleProvider = null
let appleProvider = null

if (firebaseConfigured) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
  storage = getStorage(app)
  googleProvider = new GoogleAuthProvider()
  appleProvider = new OAuthProvider('apple.com')
}

const authView = document.getElementById('authView')
const appView = document.getElementById('appView')
const sharedView = document.getElementById('sharedView')
const googleLoginBtn = document.getElementById('googleLoginBtn')
const appleLoginBtn = document.getElementById('appleLoginBtn')
const signupForm = document.getElementById('signupForm')
const signupEmail = document.getElementById('signupEmail')
const signupPassword = document.getElementById('signupPassword')
const fullNameInput = document.getElementById('fullName')
const logoutBtn = document.getElementById('logoutBtn')
const userLabel = document.getElementById('userLabel')
const userEmail = document.getElementById('userEmail')
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
const sharedFolderInfo = document.getElementById('sharedFolderInfo')
const sharedFiles = document.getElementById('sharedFiles')
const qrDialog = document.getElementById('qrDialog')
const qrCode = document.getElementById('qrCode')
const closeQrBtn = document.getElementById('closeQrBtn')
const headerLoginBtn = document.getElementById('headerLoginBtn')
const headerSignupBtn = document.getElementById('headerSignupBtn')
const configWarning = document.getElementById('configWarning')

const baseUrl = location.origin + location.pathname.replace(/index\.html?$/i, '')
const sharedRouteActive = /share=/.test(location.hash || '')

let currentUser = null
let activeFolderId = null
let activeFolderMeta = null
let folderUnsub = null
let filesUnsub = null
let sharedFilesUnsub = null
const folderCache = new Map()

const LS_USERS = 'fileshare_local_users'
const LS_SESSION = 'fileshare_local_session'
const LS_FOLDERS = 'fileshare_local_folders'
const LS_FILES = 'fileshare_local_files'

function showAuth() {
  if (!authView || !appView || !sharedView) return
  authView.classList.remove('hidden')
  appView.classList.add('hidden')
  sharedView.classList.add('hidden')
}

function showApp() {
  if (!authView || !appView || !sharedView) return
  authView.classList.add('hidden')
  appView.classList.remove('hidden')
  sharedView.classList.add('hidden')
}

function showShared() {
  if (!authView || !appView || !sharedView) return
  authView.classList.add('hidden')
  appView.classList.add('hidden')
  sharedView.classList.remove('hidden')
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function getLocalUsers() {
  return readJson(LS_USERS, [])
}

function setLocalUsers(users) {
  writeJson(LS_USERS, users)
}

function getLocalSession() {
  return readJson(LS_SESSION, null)
}

function setLocalSession(session) {
  if (!session) localStorage.removeItem(LS_SESSION)
  else writeJson(LS_SESSION, session)
}

function localSignUp(email, password, name) {
  const users = getLocalUsers()
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('Konto o tym e-mailu już istnieje')
  }
  const user = {
    uid: 'local_' + crypto.randomUUID().replace(/-/g, ''),
    email,
    password,
    displayName: name || 'Użytkownik',
  }
  users.push(user)
  setLocalUsers(users)
  setLocalSession({ uid: user.uid })
  return user
}

function localSignInProvider(providerName) {
  let users = getLocalUsers()
  let user = users.find(u => u.provider === providerName)
  if (!user) {
    user = {
      uid: 'local_' + crypto.randomUUID().replace(/-/g, ''),
      email: providerName + '@local.demo',
      password: '',
      displayName: providerName === 'google' ? 'Google User' : 'Apple User',
      provider: providerName,
    }
    users.push(user)
    setLocalUsers(users)
  }
  setLocalSession({ uid: user.uid })
  return user
}

function localGetCurrentUser() {
  const session = getLocalSession()
  if (!session) return null
  const users = getLocalUsers()
  return users.find(u => u.uid === session.uid) || null
}

function localSignOut() {
  setLocalSession(null)
}

function localGetFolders(ownerId) {
  const all = readJson(LS_FOLDERS, [])
  return all.filter(f => f.ownerId === ownerId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}

function localCreateFolder(ownerId, name) {
  const all = readJson(LS_FOLDERS, [])
  const folder = {
    id: 'folder_' + crypto.randomUUID().replace(/-/g, ''),
    ownerId,
    name,
    isPublic: false,
    shareToken: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  all.push(folder)
  writeJson(LS_FOLDERS, all)
  return folder
}

function localGetFiles(folderId) {
  const map = readJson(LS_FILES, {})
  return (map[folderId] || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}

function localAddFile(folderId, file) {
  const map = readJson(LS_FILES, {})
  map[folderId] = map[folderId] || []
  map[folderId].unshift(file)
  writeJson(LS_FILES, map)
}

function localUpdateFolder(folderId, patch) {
  const all = readJson(LS_FOLDERS, [])
  const idx = all.findIndex(f => f.id === folderId)
  if (idx === -1) return null
  all[idx] = { ...all[idx], ...patch, updatedAt: Date.now() }
  writeJson(LS_FOLDERS, all)
  return all[idx]
}

async function doGoogleLogin() {
  if (localMode) {
    const user = localSignInProvider('google')
    await handleUserSignedIn(user)
    return
  }
  await signInWithPopup(auth, googleProvider)
}

async function doAppleLogin() {
  if (localMode) {
    const user = localSignInProvider('apple')
    await handleUserSignedIn(user)
    return
  }
  await signInWithPopup(auth, appleProvider)
}

if (googleLoginBtn) {
  googleLoginBtn.addEventListener('click', async () => {
    try {
      await doGoogleLogin()
    } catch (e) {
      alert(e.message)
    }
  })
}

if (appleLoginBtn) {
  appleLoginBtn.addEventListener('click', async () => {
    try {
      await doAppleLogin()
    } catch (e) {
      alert(e.message)
    }
  })
}

if (signupForm && signupEmail && signupPassword) {
  signupForm.addEventListener('submit', async e => {
    e.preventDefault()
    const email = signupEmail.value.trim()
    const pwd = signupPassword.value
    const name = (fullNameInput && fullNameInput.value.trim()) || ''
    if (!email || !pwd) return alert('Podaj e-mail i hasło')

    try {
      if (localMode) {
        const user = localSignUp(email, pwd, name)
        await handleUserSignedIn(user)
        return
      }
      const cred = await createUserWithEmailAndPassword(auth, email, pwd)
      if (name && cred.user) await updateProfile(cred.user, { displayName: name })
    } catch (err) {
      alert(err.message)
    }
  })
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    if (localMode) {
      localSignOut()
      currentUser = null
      authView.classList.add('hidden')
      appView.classList.add('hidden')
      sharedView.classList.add('hidden')
      return
    }
    await signOut(auth)
  })
}

async function handleUserSignedIn(user) {
  currentUser = user
  if (sharedRouteActive) return
  if (!user) {
    authView.classList.add('hidden')
    appView.classList.add('hidden')
    sharedView.classList.add('hidden')
    return
  }
  userLabel.textContent = user.displayName || 'Moje konto'
  userEmail.textContent = user.email || user.uid
  showApp()
  if (!localMode) {
    await ensureUserDoc(user)
    await subscribeFolders(user.uid)
    return
  }
  await subscribeFoldersLocal(user.uid)
}

if (!localMode) {
  onAuthStateChanged(auth, async user => {
    await handleUserSignedIn(user || null)
  })
} else {
  const user = localGetCurrentUser()
  handleUserSignedIn(user)
}

if (headerLoginBtn) {
  headerLoginBtn.addEventListener('click', () => {
    showAuth()
  })
}

if (headerSignupBtn) {
  headerSignupBtn.addEventListener('click', () => {
    showAuth()
    if (signupEmail) signupEmail.focus()
  })
}

if (configWarning && localMode) {
  configWarning.classList.remove('hidden')
  configWarning.querySelector('strong').textContent = 'Tryb darmowy aktywny:'
  const textNode = configWarning.querySelector('.container')
  if (textNode) {
    textNode.childNodes[1].textContent = ' Działa lokalnie bez Firebase (demo). Dane i konta zapisują się tylko w tej przeglądarce.'
  }
}

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

if (createFolderBtn) {
  createFolderBtn.addEventListener('click', async () => {
    if (!currentUser) return
    const name = (newFolderName?.value || '').trim()
    if (!name) return

    if (localMode) {
      const folder = localCreateFolder(currentUser.uid, name)
      activeFolderId = folder.id
      if (newFolderName) newFolderName.value = ''
      await subscribeFoldersLocal(currentUser.uid)
      await subscribeFilesLocal(folder.id)
      return
    }

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
    if (newFolderName) newFolderName.value = ''
    await setDoc(doc(db, 'folders', folderRef.id), { publicId: folderRef.id }, { merge: true })
    await subscribeFiles(folderRef.id)
  })
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

async function subscribeFoldersLocal(uid) {
  const folders = localGetFolders(uid)
  folders.forEach(folder => folderCache.set(folder.id, folder))
  renderFolders(folders)
  if (!activeFolderId && folders.length) {
    await selectFolder(folders[0].id, folders[0].name)
  }
}

function renderFolders(folders = []) {
  if (!folderList) return
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
  if (activeFolderTitle) activeFolderTitle.textContent = name
  if (activeFolderInfo) activeFolderInfo.textContent = `${activeFolderMeta.isPublic ? 'Publiczny' : 'Prywatny'} • Folder: ${id}`
  if (shareLinkBtn) shareLinkBtn.disabled = false
  if (shareQrBtn) shareQrBtn.disabled = false

  if (localMode) {
    await subscribeFilesLocal(id)
  } else {
    await subscribeFiles(id)
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

async function subscribeFilesLocal(folderId) {
  const files = localGetFiles(folderId)
  await renderFiles(files)
}

async function renderFiles(files = []) {
  if (!fileList) return
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

if (chooseFilesBtn && fileInput) chooseFilesBtn.addEventListener('click', () => fileInput.click())
if (uploadZone) {
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('hover') })
  uploadZone.addEventListener('dragleave', e => { e.preventDefault(); uploadZone.classList.remove('hover') })
  uploadZone.addEventListener('drop', async e => {
    e.preventDefault()
    uploadZone.classList.remove('hover')
    if (!activeFolderId) return alert('Wybierz folder')
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length) await uploadFiles(activeFolderId, files)
  })
}

if (fileInput) {
  fileInput.addEventListener('change', async e => {
    if (!activeFolderId) return alert('Wybierz folder')
    const files = Array.from(e.target.files || [])
    if (files.length) await uploadFiles(activeFolderId, files)
    fileInput.value = ''
  })
}

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
    if (uploadProgress) uploadProgress.prepend(node)

    if (localMode) {
      const url = URL.createObjectURL(file)
      localAddFile(folderId, {
        id: 'file_' + crypto.randomUUID().replace(/-/g, ''),
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        downloadUrl: url,
        createdAt: Date.now(),
      })
      node.querySelector('.progress-bar > i').style.width = '100%'
      node.querySelector('.file-meta').innerHTML = `<a href="${url}" target="_blank" rel="noopener">Pobierz</a>`
      await subscribeFilesLocal(folderId)
      continue
    }

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

if (shareLinkBtn) {
  shareLinkBtn.addEventListener('click', async () => {
    if (!activeFolderId) return
    const token = crypto.randomUUID().replace(/-/g, '')

    if (localMode) {
      activeFolderMeta = localUpdateFolder(activeFolderId, { isPublic: true, shareToken: token })
      folderCache.set(activeFolderId, activeFolderMeta)
      const url = `${baseUrl}#share=${activeFolderId}&token=${token}`
      await navigator.clipboard.writeText(url)
      alert('Link skopiowany')
      return
    }

    const folderRef = doc(db, 'folders', activeFolderId)
    await setDoc(folderRef, { isPublic: true, shareToken: token, updatedAt: serverTimestamp() }, { merge: true })
    activeFolderMeta = { ...(activeFolderMeta || {}), isPublic: true, shareToken: token }
    folderCache.set(activeFolderId, activeFolderMeta)
    const url = `${baseUrl}#share=${activeFolderId}&token=${token}`
    await navigator.clipboard.writeText(url)
    alert('Link skopiowany')
  })
}

if (shareQrBtn) {
  shareQrBtn.addEventListener('click', () => {
    if (!activeFolderId) return
    const token = activeFolderMeta?.shareToken || ''
    const url = `${baseUrl}#share=${activeFolderId}&token=${token}`
    qrCode.innerHTML = ''
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
}

if (closeQrBtn) closeQrBtn.addEventListener('click', () => qrDialog.close())

async function bootSharedFolderFromHash() {
  const hash = location.hash || ''
  const match = hash.match(/share=([^&]+)(?:&token=([^&]+))?/)
  if (!match) return false

  const sharedFolderId = match[1]
  const sharedFolderToken = match[2] || null
  showShared()

  if (localMode) {
    const folders = readJson(LS_FOLDERS, [])
    const folder = folders.find(f => f.id === sharedFolderId)
    if (!folder) {
      sharedFolderInfo.textContent = 'Folder nie istnieje'
      return true
    }
    if (!folder.isPublic) {
      sharedFolderInfo.textContent = 'Folder nie jest publiczny'
      return true
    }
    if (folder.shareToken && sharedFolderToken && folder.shareToken !== sharedFolderToken) {
      sharedFolderInfo.textContent = 'Nieprawidłowy kod udostępniania'
      return true
    }
    sharedFolderInfo.textContent = folder.name || sharedFolderId
    const files = localGetFiles(sharedFolderId)
    renderSharedFiles(files)
    return true
  }

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
    const files = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    renderSharedFiles(files)
  })
  return true
}

function renderSharedFiles(files) {
  if (!sharedFiles) return
  sharedFiles.innerHTML = ''
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
}

function escapeHtml(s) {
  return String(s).replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

bootSharedFolderFromHash()
