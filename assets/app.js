// Client-side app for uploads using Firebase Storage.
// IMPORTANT: Replace the firebaseConfig object with your project's config (see README).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js'
import { getStorage, ref, uploadBytesResumable, getDownloadURL, listAll } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js'

// --- CONFIG: paste your Firebase config here ---
const firebaseConfig = {
  // apiKey: "...",
  // authDomain: "...",
  // projectId: "...",
  // storageBucket: "...",
  // messagingSenderId: "...",
  // appId: "..."
}

if (!firebaseConfig || !firebaseConfig.storageBucket) {
  console.warn('Firebase config missing. Wprowadź konfigurację w assets/app.js zgodnie z README.')
}

let app, storage
try{
  app = initializeApp(firebaseConfig)
  storage = getStorage(app)
}catch(e){
  // initialization may fail until config is provided
}

const dropZone = document.getElementById('dropZone')
const fileInput = document.getElementById('fileInput')
const chooseBtn = document.getElementById('chooseBtn')
const progressArea = document.getElementById('progressArea')
const filesList = document.getElementById('files')

chooseBtn.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', e => handleFiles(e.target.files))

['dragenter','dragover'].forEach(ev=>{
  dropZone.addEventListener(ev,(e)=>{e.preventDefault();dropZone.classList.add('hover')})
})
['dragleave','drop'].forEach(ev=>{
  dropZone.addEventListener(ev,(e)=>{e.preventDefault();dropZone.classList.remove('hover')})
})

dropZone.addEventListener('drop', e => {
  const dt = e.dataTransfer
  if (dt && dt.files && dt.files.length) handleFiles(dt.files)
})

function handleFiles(list){
  if (!storage) return alert('Brak konfiguracji Firebase. Zobacz README aby skonfigurować projekt.')
  Array.from(list).forEach(file => uploadFile(file))
}

function uploadFile(file){
  const id = Math.random().toString(36).slice(2,9)
  const node = document.createElement('div')
  node.className = 'file-progress'
  node.innerHTML = `<div class="file-info"><strong>${escapeHtml(file.name)}</strong><div class="file-meta">${(file.size/1024/1024).toFixed(2)} MB</div></div><div style="width:40%"><div class="progress-bar"><i></i></div></div>`
  progressArea.prepend(node)

  const storageRef = ref(storage, `uploads/${id}_${file.name}`)
  const uploadTask = uploadBytesResumable(storageRef, file)

  uploadTask.on('state_changed', snapshot => {
    const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
    node.querySelector('.progress-bar > i').style.width = pct + '%'
  }, err => {
    node.querySelector('.file-meta').textContent = 'Błąd: ' + err.message
  }, () => {
    getDownloadURL(uploadTask.snapshot.ref).then(url => {
      node.querySelector('.file-meta').innerHTML = `<a href="${url}" target="_blank" rel="noopener">Pobierz</a>`
      // refresh file list
      listFiles()
    })
  })
}

function listFiles(){
  if (!storage) return
  const listRef = ref(storage, 'uploads')
  listAll(listRef).then(res => {
    filesList.innerHTML = ''
    if (!res.items.length) {
      filesList.innerHTML = '<li class="file-empty">Brak plików</li>'
      return
    }
    res.items.sort((a,b)=>a.name.localeCompare(b.name))
    res.items.forEach(itemRef => {
      getDownloadURL(itemRef).then(url => {
        const li = document.createElement('li')
        li.innerHTML = `<div><strong>${escapeHtml(itemRef.name)}</strong><div class="file-meta">URL: <a href="${url}" target="_blank" rel="noopener">pobierz</a></div></div><div>${(itemRef.name.match(/_(.*)$/)||[''])[0] ? '' : ''}</div>`
        filesList.appendChild(li)
      })
    })
  }).catch(err=>{console.error(err)})
}

function escapeHtml(s){return String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"})[c])}

// initial load
setTimeout(()=>{ if (storage) listFiles() }, 500)
