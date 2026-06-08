# FileShare

FileShare to prosta strona do wymiany plików oparta o konta i foldery:

- **Logowanie**: e-mail i hasło, Google lub Apple
- **Foldery prywatne**: tylko dla zalogowanego właściciela
- **Udostępnianie**: publiczny link albo QR, bez konta po stronie odbiorcy

Strona działa na GitHub Pages.

## Wymagania

- konto GitHub
- projekt Firebase
- włączone usługi: Authentication, Firestore, Storage

## Konfiguracja Firebase

1. Wejdź do Firebase Console: https://console.firebase.google.com
2. Utwórz projekt
3. Włącz **Authentication** i aktywuj:
  - e-mail i hasło
  - Google
  - Apple, jeśli chcesz używać logowania Apple
4. Włącz **Firestore Database**
5. Włącz **Storage**
6. Dodaj web app i skopiuj obiekt `firebaseConfig`
7. Wklej `firebaseConfig` do `assets/app.js`

## Reguły Firestore

Użyj tego na start do folderów i publicznego udostępniania:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /folders/{folderId} {
      allow read: if request.auth != null || resource.data.isPublic == true;
      allow write: if request.auth != null && request.auth.uid == resource.data.ownerId;
      match /files/{fileId} {
        allow read: if request.auth != null || get(/databases/$(database)/documents/folders/$(folderId)).data.isPublic == true;
        allow write: if request.auth != null && request.auth.uid == get(/databases/$(database)/documents/folders/$(folderId)).data.ownerId;
      }
    }

    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Reguły Storage

```text
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Jak działa udostępnianie folderu

1. Zaloguj się
2. Utwórz folder i dodaj pliki
3. Kliknij **Udostępnij link** albo **QR**
4. Odbiorca otwiera link bez logowania i widzi tylko ten folder

## Deploy na GitHub Pages

Repo jest już przygotowane do automatycznego deployu przez GitHub Actions.

Jeśli chcesz przejść ręcznie:

```bash
git add .
git commit -m "Update FileShare"
git push origin main
```

GitHub Pages powinien publikować branch `main`.

## Uwagi

- Foldery prywatne są tylko dla właściciela.
- Publiczny link prowadzi do widoku tylko-do-odczytu.
- Apple login wymaga dodatkowej konfiguracji w Firebase i po stronie Apple Developer.
