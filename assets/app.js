// FileShare: cloud mode + P2P/WebRTC mode
// Paste your Firebase config below.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js'
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js'
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
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

let currentUser = null
let currentMode = 'cloud'

// cloud UI
const dropZone = document.getElementById('dropZone')
const fileInput = document.getElementById('fileInput')
const chooseBtn = document.getElementById('chooseBtn')
const progressArea = document.getElementById('progressArea')
const filesList = document.getElementById('files')

// mode switches
const cloudBtn = document.getElementById('modeCloudBtn')
const p2pBtn = document.getElementById('modeP2PBtn')
const cloudPanel = document.getElementById('cloudPanel')
const p2pPanel = document.getElementById('p2pPanel')

// p2p ui
const createRoomBtn = document.getElementById('createRoomBtn')
const joinRoomBtn = document.getElementById('joinRoomBtn')
const leaveRoomBtn = document.getElementById('leaveRoomBtn')
const copyRoomCodeBtn = document.getElementById('copyRoomCodeBtn')
const roomCodeInput = document.getElementById('roomCode')
const joinRoomInput = document.getElementById('joinRoomInput')
const p2pStatus = document.getElementById('p2pStatus')
const p2pChooseBtn = document.getElementById('p2pChooseBtn')
const p2pFileInput = document.getElementById('p2pFileInput')
const p2pDropZone = document.getElementById('p2pDropZone')
const sendFilesBtn = document.getElementById('sendFilesBtn')
const selectedFilesLabel = document.getElementById('selectedFilesLabel')
const p2pProgressArea = document.getElementById('p2pProgressArea')
const receivedFiles = document.getElementById('receivedFiles')

let selectedCloudFiles = []
let selectedP2PFiles = []

// p2p runtime state
let roomId = null
let roomUnsub = null
let candidatesUnsub = []
let localCandidateUnsub = null
let pc = null
let dataChannel = null
let incomingBuffers = new Map()
let incomingMeta = new Map()

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

const batchSize = 16 * 1024

signInAnonymously(auth).catch(err => console.warn('Anonymous auth failed:', err))
onAuthStateChanged(auth, async user => {
  currentUser = user || null
  if (currentMode === 'cloud') {
    await listFiles()
  }
})

// mode switching
cloudBtn.addEventListener('click', () => setMode('cloud'))
p2pBtn.addEventListener('click', () => setMode('p2p'))

function setMode(mode) {
  currentMode = mode
  cloudBtn.classList.toggle('active', mode === 'cloud')
  p2pBtn.classList.toggle('active', mode === 'p2p')
  cloudPanel.classList.toggle('active', mode === 'cloud')
  p2pPanel.classList.toggle('active', mode === 'p2p')
  if (mode === 'cloud') {
    listFiles()
  }
}

// cloud mode
chooseBtn.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', e => {
  selectedCloudFiles = Array.from(e.target.files || [])
  handleFiles(selectedCloudFiles)
})

dropZone.addEventListener('dragenter', e => {
  e.preventDefault(); dropZone.classList.add('hover')
})
dropZone.addEventListener('dragover', e => {
  e.preventDefault(); dropZone.classList.add('hover')
})
dropZone.addEventListener('dragleave', e => {
  e.preventDefault(); dropZone.classList.remove('hover')
})
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('hover')
  const dt = e.dataTransfer
  if (dt?.files?.length) {
    selectedCloudFiles = Array.from(dt.files)
    handleFiles(selectedCloudFiles)
  }
})

function handleFiles(list) {
  if (!list?.length) return
  list.forEach(file => uploadFile(file))
}

function uploadFile(file) {
  const id = Math.random().toString(36).slice(2, 9)
  const node = document.createElement('div')
  node.className = 'file-progress'
  node.innerHTML = `
    <div class="file-info">
      <strong>${escapeHtml(file.name)}</strong>
      <div class="file-meta">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
    </div>
    <div style="width:40%"><div class="progress-bar"><i></i></div></div>
  `
  progressArea.prepend(node)

  const storageRef = ref(storage, `uploads/${id}_${file.name}`)
  const uploadTask = uploadBytesResumable(storageRef, file)

  uploadTask.on('state_changed', snapshot => {
    const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
    node.querySelector('.progress-bar > i').style.width = pct + '%'
  }, err => {
    node.querySelector('.file-meta').textContent = 'Błąd: ' + err.message
  }, async () => {
    const url = await getDownloadURL(uploadTask.snapshot.ref)
    node.querySelector('.file-meta').innerHTML = `
      <a href="${url}" target="_blank" rel="noopener">Pobierz</a>
      <button class="btn small copy" data-url="${url}">Kopiuj link</button>
    `
    node.querySelector('.copy')?.addEventListener('click', () => navigator.clipboard.writeText(url).then(() => alert('Link skopiowany')))
    listFiles()
  })
}

async function listFiles() {
  if (!filesList) return
  const listRef = ref(storage, 'uploads')
  try {
    const res = await listAll(listRef)
    filesList.innerHTML = ''
    if (!res.items.length) {
      filesList.innerHTML = '<li class="file-empty">Brak plików</li>'
      return
    }
    res.items.sort((a, b) => a.name.localeCompare(b.name))
    for (const itemRef of res.items) {
      const url = await getDownloadURL(itemRef)
      const displayName = itemRef.name.replace(/^[^_]+_/, '')
      const li = document.createElement('li')
      li.innerHTML = `
        <div>
          <strong>${escapeHtml(displayName)}</strong>
          <div class="file-meta">URL: <a href="${url}" target="_blank" rel="noopener">pobierz</a></div>
        </div>
        <div><button class="btn small copy" data-url="${url}">Kopiuj</button></div>
      `
      li.querySelector('.copy')?.addEventListener('click', () => navigator.clipboard.writeText(url).then(() => alert('Link skopiowany')))
      filesList.appendChild(li)
    }
  } catch (err) {
    console.error(err)
  }
}

// p2p mode
p2pChooseBtn.addEventListener('click', () => p2pFileInput.click())
p2pFileInput.addEventListener('change', e => {
  selectedP2PFiles = Array.from(e.target.files || [])
  updateSelectedFilesLabel()
})

p2pDropZone.addEventListener('dragenter', e => { e.preventDefault(); p2pDropZone.classList.add('hover') })
p2pDropZone.addEventListener('dragover', e => { e.preventDefault(); p2pDropZone.classList.add('hover') })
p2pDropZone.addEventListener('dragleave', e => { e.preventDefault(); p2pDropZone.classList.remove('hover') })
p2pDropZone.addEventListener('drop', e => {
  e.preventDefault()
  p2pDropZone.classList.remove('hover')
  const dt = e.dataTransfer
  if (dt?.files?.length) {
    selectedP2PFiles = Array.from(dt.files)
    updateSelectedFilesLabel()
  }
})

createRoomBtn.addEventListener('click', createRoom)
joinRoomBtn.addEventListener('click', joinRoom)
leaveRoomBtn.addEventListener('click', leaveRoom)
copyRoomCodeBtn.addEventListener('click', () => {
  if (!roomId) return
  navigator.clipboard.writeText(roomId).then(() => alert('Kod pokoju skopiowany'))
})
sendFilesBtn.addEventListener('click', sendSelectedP2PFiles)

function updateSelectedFilesLabel() {
  selectedFilesLabel.textContent = selectedP2PFiles.length
    ? `${selectedP2PFiles.length} plik(i): ${selectedP2PFiles.map(f => f.name).join(', ')}`
    : 'Brak plików'
  sendFilesBtn.disabled = !dataChannel || dataChannel.readyState !== 'open' || !selectedP2PFiles.length
}

function setP2PStatus(text) {
  p2pStatus.textContent = text
}

function setRoomUi(active) {
  leaveRoomBtn.disabled = !active
  createRoomBtn.disabled = active
  joinRoomBtn.disabled = active
  copyRoomCodeBtn.disabled = !roomId
  roomCodeInput.value = roomId || ''
}

async function createRoom() {
  await resetP2P()
  pc = new RTCPeerConnection(rtcConfig)
  dataChannel = pc.createDataChannel('files')
  wireDataChannel()
  wirePeerConnection()

  const roomRef = doc(collection(db, 'rooms'))
  roomId = roomRef.id
  setRoomUi(true)
  setP2PStatus('Tworzenie pokoju…')

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  await setDoc(roomRef, {
    offer: { type: offer.type, sdp: offer.sdp },
    createdAt: serverTimestamp(),
  })

  roomUnsub = onSnapshot(roomRef, async snap => {
    const data = snap.data()
    if (!data) return
    if (data.answer && !pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer))
      setP2PStatus('Połączono z drugim urządzeniem')
    }
  })

  listenToRemoteCandidates(roomId, 'caller')
  setP2PStatus(`Pokój gotowy: ${roomId}`)
}

async function joinRoom() {
  const id = joinRoomInput.value.trim()
  if (!id) return alert('Wpisz kod pokoju')
  await resetP2P()
  pc = new RTCPeerConnection(rtcConfig)
  wireDataChannel()
  wirePeerConnection()

  const roomRef = doc(db, 'rooms', id)
  const roomSnap = await getDoc(roomRef)
  if (!roomSnap.exists()) {
    alert('Pokój nie istnieje')
    await resetP2P()
    return
  }

  roomId = id
  setRoomUi(true)
  setP2PStatus('Dołączanie do pokoju…')

  const roomData = roomSnap.data()
  await pc.setRemoteDescription(new RTCSessionDescription(roomData.offer))

  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)

  await updateDoc(roomRef, {
    answer: { type: answer.type, sdp: answer.sdp },
  })

  listenToRemoteCandidates(roomId, 'callee')
  setP2PStatus(`Połączono z pokojem ${roomId}`)
}

function wirePeerConnection() {
  pc.onicecandidate = async event => {
    if (!event.candidate || !roomId) return
    const role = pc?.localDescription?.type === 'offer' ? 'caller' : 'callee'
    const candidateRef = collection(db, 'rooms', roomId, `${role}Candidates`)
    await addDoc(candidateRef, {
      ...event.candidate.toJSON(),
      createdAt: serverTimestamp(),
    })
  }

  pc.onconnectionstatechange = () => {
    setP2PStatus(`Połączenie: ${pc.connectionState}`)
    if (pc.connectionState === 'connected') {
      sendFilesBtn.disabled = !selectedP2PFiles.length
    }
    if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
      sendFilesBtn.disabled = true
    }
  }

  pc.ondatachannel = event => {
    dataChannel = event.channel
    wireDataChannel()
  }
}

function wireDataChannel() {
  if (!dataChannel) return
  dataChannel.binaryType = 'arraybuffer'
  dataChannel.onopen = () => {
    setP2PStatus(`Kanał danych gotowy${roomId ? ` (${roomId})` : ''}`)
    updateSelectedFilesLabel()
  }
  dataChannel.onclose = () => setP2PStatus('Kanał danych zamknięty')
  dataChannel.onerror = err => console.error('DataChannel error', err)
  dataChannel.onmessage = event => handleIncomingMessage(event.data)
}

function listenToRemoteCandidates(id, role) {
  const remoteRole = role === 'caller' ? 'calleeCandidates' : 'callerCandidates'
  const q = query(collection(db, 'rooms', id, remoteRole), orderBy('createdAt', 'asc'))
  const unsub = onSnapshot(q, snap => {
    snap.docChanges().forEach(change => {
      if (change.type !== 'added') return
      const candidate = new RTCIceCandidate(change.doc.data())
      if (pc) pc.addIceCandidate(candidate).catch(console.warn)
    })
  })
  candidatesUnsub.push(unsub)
}

async function sendSelectedP2PFiles() {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    alert('Połączenie P2P nie jest gotowe')
    return
  }
  if (!selectedP2PFiles.length) return

  for (const file of selectedP2PFiles) {
    await sendFile(file)
  }
}

async function sendFile(file) {
  const fileId = crypto.randomUUID()
  const totalChunks = Math.ceil(file.size / batchSize)

  const meta = {
    type: 'file-start',
    id: fileId,
    name: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    totalChunks,
  }
  dataChannel.send(JSON.stringify(meta))

  const node = createP2PProgressNode(file.name)
  const reader = file.stream().getReader()
  let bytesSent = 0
  let chunkIndex = 0

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    const buffer = value instanceof Uint8Array ? value : new Uint8Array(value)
    for (let offset = 0; offset < buffer.length; offset += batchSize) {
      const slice = buffer.slice(offset, offset + batchSize)
      await waitForBufferRoom()
      dataChannel.send(slice)
      bytesSent += slice.byteLength
      chunkIndex += 1
      const pct = Math.min(100, (bytesSent / file.size) * 100)
      node.querySelector('.progress-bar > i').style.width = pct + '%'
      node.querySelector('.file-meta').textContent = `${chunkIndex}/${totalChunks} chunk(i)`
    }
  }

  dataChannel.send(JSON.stringify({ type: 'file-end', id: fileId }))
  node.querySelector('.file-meta').textContent = 'Wysłano'
}

function createP2PProgressNode(name) {
  const node = document.createElement('div')
  node.className = 'file-progress'
  node.innerHTML = `
    <div class="file-info">
      <strong>${escapeHtml(name)}</strong>
      <div class="file-meta">Start wysyłania</div>
    </div>
    <div style="width:40%"><div class="progress-bar"><i></i></div></div>
  `
  p2pProgressArea.prepend(node)
  return node
}

function handleIncomingMessage(message) {
  if (typeof message === 'string') {
    try {
      const data = JSON.parse(message)
      if (data.type === 'file-start') {
        incomingBuffers.set(data.id, [])
        incomingMeta.set(data.id, data)
        addReceivedPlaceholder(data)
      } else if (data.type === 'file-end') {
        finalizeIncomingFile(data.id)
      }
    } catch {
      console.warn('Nieobsługiwana wiadomość tekstowa:', message)
    }
    return
  }

  // binary chunk
  const activeId = [...incomingBuffers.keys()].at(-1)
  if (!activeId) return
  incomingBuffers.get(activeId).push(new Uint8Array(message))
  const meta = incomingMeta.get(activeId)
  const receivedBytes = incomingBuffers.get(activeId).reduce((sum, part) => sum + part.byteLength, 0)
  updateIncomingPlaceholder(activeId, meta, receivedBytes)
}

function addReceivedPlaceholder(meta) {
  const item = document.createElement('div')
  item.className = 'received-item'
  item.dataset.id = meta.id
  item.innerHTML = `
    <div>
      <strong>${escapeHtml(meta.name)}</strong>
      <div class="file-meta">0%</div>
    </div>
    <div class="progress-bar" style="width:40%"><i></i></div>
  `
  receivedFiles.prepend(item)
}

function updateIncomingPlaceholder(id, meta, bytes) {
  const node = receivedFiles.querySelector(`[data-id="${id}"]`)
  if (!node || !meta) return
  const pct = Math.min(100, (bytes / meta.size) * 100)
  node.querySelector('.progress-bar > i').style.width = pct + '%'
  node.querySelector('.file-meta').textContent = `${pct.toFixed(0)}%`
}

function finalizeIncomingFile(id) {
  const meta = incomingMeta.get(id)
  const parts = incomingBuffers.get(id) || []
  if (!meta || !parts.length) return

  const blob = new Blob(parts, { type: meta.mime || 'application/octet-stream' })
  const url = URL.createObjectURL(blob)

  const node = receivedFiles.querySelector(`[data-id="${id}"]`)
  if (node) {
    node.innerHTML = `
      <div>
        <strong>${escapeHtml(meta.name)}</strong>
        <div class="file-meta">Gotowe • ${(meta.size / 1024 / 1024).toFixed(2)} MB</div>
      </div>
      <div>
        <a class="btn small" href="${url}" download="${escapeHtml(meta.name)}">Pobierz</a>
      </div>
    `
  }

  incomingBuffers.delete(id)
  incomingMeta.delete(id)
}

function waitForBufferRoom() {
  return new Promise(resolve => {
    const check = () => {
      if (!dataChannel || dataChannel.bufferedAmount < 1_000_000) return resolve()
      setTimeout(check, 30)
    }
    check()
  })
}

async function resetP2P() {
  if (roomUnsub) roomUnsub()
  roomUnsub = null
  candidatesUnsub.forEach(fn => fn())
  candidatesUnsub = []
  if (localCandidateUnsub) localCandidateUnsub()
  localCandidateUnsub = null

  if (pc) {
    try { pc.close() } catch {}
  }
  pc = null
  dataChannel = null
  roomId = null
  incomingBuffers.clear()
  incomingMeta.clear()
  receivedFiles.innerHTML = ''
  setRoomUi(false)
  setP2PStatus('Niepołączono')
  updateSelectedFilesLabel()
}

leaveRoomBtn.addEventListener('click', async () => {
  await resetP2P()
})

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  })[c])
}

setMode('cloud')
setTimeout(() => listFiles().catch(() => {}), 500)
